/* eslint-disable no-unused-vars */
/* eslint-disable valid-jsdoc */
/* eslint-disable object-curly-spacing */
/* eslint-disable max-len */
/* eslint-disable indent */
const { onRequest } = require("firebase-functions/v2/https");
// const logger = require("firebase-functions/logger");
const { setGlobalOptions } = require("firebase-functions/v2");
setGlobalOptions({ maxInstances: 10 });

const admin = require("firebase-admin");

const crypto = require("crypto");

const serviceAccount = require("./permisions.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const express = require("express");

const app = express();
const cors = require("cors");
const database = admin.firestore();
app.use(cors({ origin: true }));

// ====================================================================================================
// ⭐️ MIDDLEWARE DE AUTENTICAÇÃO (Adicionado)
// ====================================================================================================

/**
 * Middleware para verificar o Token de ID do Firebase no cabeçalho Authorization.
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({
      message: "Acesso negado. Token não fornecido ou formato inválido.",
    });
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    // Verifica e decodifica o Token de ID do Firebase
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    // Anexa o objeto do usuário (com UID) à requisição
    req.user = decodedToken;

    // Continua para a próxima função (o handler da rota)
    next();
  } catch (error) {
    console.error("Erro ao verificar o Token de ID:", error);
    return res.status(401).send({ message: "Token inválido ou expirado." });
  }
};

// ====================================================================================================
// ---------------------------------------------------------------------------------------------> Routes USERS
// ====================================================================================================

// Post (CREATE): Cria usuário e uma conta bancária inicial

app.post("/users/", authenticate, (req, res) => {
  (authenticate,
  async () => {
    try {
      const authUserId = req.user.user_id;
      const userDocRef = database.collection("users").doc(authUserId);

      await userDocRef.set({
        name: req.body.name,
        email: req.body.email,
        telephone: req.body.telephone,
        acceptTermAndPolice: req.body.acceptTermAndPolice,
        createdAt: new Date().toISOString(),
      });

      const newAccountData = {
        associatedUser: authUserId,
        name: `Conta Principal - ${req.body.name}`,
        balance: 4000,
        createdAt: new Date().toISOString(),
      };

      const accountRef = await database
        .collection("bankAccounts")
        .add(newAccountData);

      return res.status(200).send({
        message: "Usuário e Conta Principal criados com sucesso!",
        userId: authUserId,
        bankAccountId: accountRef.id,
        bankAccountNumber: crypto.randomUUID(),
      });
    } catch (error) {
      console.log(error);

      return res.status(500).send(error);
    }
  })();
});

// read all users (READ): APENAS PARA DEBUG
app.get("/users/", authenticate, async (req, res) => {
  try {
    console.log({ user: req.user });

    const query = database.collection("users");
    const querySnapshot = await query.get();

    const response = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).send(response);
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    return res.status(500).send({
      message: "Erro interno do servidor",
      error: error.message,
    });
  }
});

app.get("/users/:id", authenticate, authenticate, async (req, res) => {
  try {
    const userId = req.params.id;
    const userRef = database.collection("users").doc(userId);
    const doc = await userRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "Usuário não encontrado." });
    }

    const userData = {
      ...doc.data(),
    };

    return res.status(200).send(userData);
  } catch (error) {
    console.error("Erro ao buscar usuário:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao buscar usuário.",
      error: error.message,
    });
  }
});

app.put("/users/:id", authenticate, async (req, res) => {
  try {
    const userId = req.params.id;
    const updateData = req.body;
    const userRef = database.collection("users").doc(userId);
    const doc = await userRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "Usuário não encontrado." });
    }

    await userRef.update(updateData);

    return res.status(200).send({
      message: `Usuário com ID ${userId} atualizado com sucesso.`,
      id: userId,
    });
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao atualizar.",
      error: error.message,
    });
  }
});

app.delete("/users/:id", authenticate, async (req, res) => {
  try {
    const userId = req.params.id;
    const userRef = database.collection("users").doc(userId);
    const doc = await userRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "Usuário não encontrado." });
    }

    await userRef.delete();

    return res.status(200).send({
      message: `Usuário com ID ${userId} excluído com sucesso.`,
      id: userId,
    });
  } catch (error) {
    console.error("Erro ao excluir usuário:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao excluir.",
      error: error.message,
    });
  }
});

// ---------------------------------------------------------------------------------------------> CONTA BANCÁRIA
// (Você tinha um '/product/:id' e um '/routes transactions' aqui, mantidos como referência)

app.post("/bankAccounts", authenticate, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { initialBalance } = req.body;

    const newAccountData = {
      associatedUser: userId,
      balance: parseFloat(initialBalance) || 5000,
      createdAt: new Date().toISOString(),
    };

    const docRef = await database
      .collection("bankAccounts")
      .add(newAccountData);

    return res.status(201).send({
      message: "Conta bancária criada com sucesso!",
      id: docRef.id,
      accountId: newAccountData.accountId,
    });
  } catch (error) {
    console.error("Erro ao criar conta bancária:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao criar conta bancária.",
      error: error.message,
    });
  }
});

app.get("/bankAccounts", authenticate, async (req, res) => {
  try {
    const query = database
      .collection("bankAccounts")
      .orderBy("createdAt", "asc");

    const querySnapshot = await query.get();

    const bankAccounts = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).send(bankAccounts);
  } catch (error) {
    console.error("Erro ao listar contas bancárias:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao listar contas bancárias.",
      error: error.message,
    });
  }
});

app.get("/bankAccounts/:id", authenticate, async (req, res) => {
  try {
    const accountDocId = req.params.id;
    const userId = req.user.user_id;
    console.log({ userId });

    const docRef = database.collection("bankAccounts").doc(accountDocId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res
        .status(404)
        .send({ message: "Conta bancária não encontrada." });
    }

    const accountData = { id: doc.id, ...doc.data() };

    if (accountData.associatedUser !== userId) {
      return res.status(403).send({
        message:
          "Acesso negado. Esta conta bancária não pertence ao seu usuário.",
      });
    }

    return res.status(200).send(accountData);
  } catch (error) {
    console.error("Erro ao buscar conta bancária:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao buscar conta bancária.",
      error: error.message,
    });
  }
});

// ---------------------------------------------------------------------------------------------> Outras Rotas
// (Você tinha um '/product/:id' e um '/routes transactions' aqui, mantidos como referência)
// APENAS TRANSFERÊNCIAS
// app.post("/transactions", authenticate, async (req, res) => {
app.post("/transactions", authenticate, async (req, res) => {
  const userId = req.user.user_id;

  const { fromAccountId, toAccountId, amount, anexo, urlAnexo } = req.body;

  if (!fromAccountId || !toAccountId || !amount || amount <= 0) {
    return res
      .status(400)
      .send({ message: "Dados de transação inválidos ou incompletos." });
  }

  // Referências aos documentos
  const fromAccountRef = database.collection("bankAccounts").doc(fromAccountId);
  const toAccountRef = database.collection("bankAccounts").doc(toAccountId);

  try {
    const transactionRefs = await database.runTransaction(
      async (transaction) => {
        const fromDoc = await transaction.get(fromAccountRef);
        const toDoc = await transaction.get(toAccountRef);

        if (!fromDoc.exists || !toDoc.exists) {
          throw new Error("Uma das contas bancárias não foi encontrada.");
        }

        // 🚨 NOVO LOG DE DIAGNÓSTICO: O QUE ESTÁ SENDO USADO?

        if (fromDoc.data().associatedUser !== userId) {
          throw new Error(
            "Permissão negada. Você não é o dono da conta de origem.",
          );
        }

        const currentBalance = fromDoc.data().balance || 0;
        const transferAmount = parseFloat(amount);

        if (currentBalance < transferAmount) {
          throw new Error("Saldo insuficiente para realizar a transação.");
        }

        const newFromBalance = currentBalance - transferAmount;
        const newToBalance = (toDoc.data().balance || 0) + transferAmount;

        transaction.update(fromAccountRef, { balance: newFromBalance });
        transaction.update(toAccountRef, { balance: newToBalance });

        const senderUID = fromDoc.data().associatedUser; // UID do Remetente (usuário logado)
        const receiverUID = toDoc.data().associatedUser; // UID do Recebedor (dono da conta de destino)
        const dateString = new Date().toISOString();
        console.log({ senderUID }, fromDoc.data());
        const baseTransactionRef = database.collection("transactions").doc();

        const senderTransactionData = {
          fromAccountId: fromAccountId,
          toAccountId: toAccountId,
          amount: transferAmount,
          date: dateString,
          anexo: anexo || null,
          urlAnexo: urlAnexo || null,
          associatedUser: senderUID,
          type: "sended",
          createdAt: dateString,
          name: fromDoc.data().name,
        };

        // 🚨 NOVO LOG DE DIAGNÓSTICO: O QUE SERÁ ESCRITO?
        console.log(`[DOC REMETENTE] Gravando 'sended' para UID: ${senderUID}`);

        transaction.set(baseTransactionRef, senderTransactionData);

        const receiverTransactionData = {
          fromAccountId: fromAccountId,
          toAccountId: toAccountId,
          amount: transferAmount,
          date: dateString,
          anexo: anexo || null,
          urlAnexo: urlAnexo || null,
          associatedUser: receiverUID,
          type: "received",
          createdAt: dateString,
          name: toDoc.data().name,
        };
        // 🚨 NOVO LOG DE DIAGNÓSTICO: O QUE SERÁ ESCRITO?
        console.log(
          `[DOC RECEBEDOR] Gravando 'received' para UID: ${receiverUID}`,
        );

        // Criar um SEGUNDO documento com o mesmo conteúdo base, mas ID diferente
        const receiverTransactionRef = database
          .collection("transactions")
          .doc();
        transaction.set(receiverTransactionRef, receiverTransactionData);

        return {
          senderId: baseTransactionRef.id,
          receiverId: receiverTransactionRef.id,
        };
      },
    );

    return res.status(201).send({
      message:
        "Transação (transferência) realizada e saldos atualizados com sucesso.",
      senderId: transactionRefs.senderId,
      receiverId: transactionRefs.receiverId,
    });
  } catch (error) {
    console.error("Erro ao executar transação:", error.message);

    if (
      error.message.includes("Saldo insuficiente") ||
      error.message.includes("Permissão negada") ||
      error.message.includes("não foi encontrada")
    ) {
      return res.status(403).send({ message: error.message });
    }

    return res.status(500).send({
      message: "Erro interno do servidor ao processar a transação.",
      error: error.message,
    });
  }
});

app.get("/transactions", authenticate, async (req, res) => {
  try {
    console.log(req.user);
    const userId = req.user.user_id; // O UID do usuário autenticado

    // ⭐️ A QUERY principal: Busca transações onde associatedUser é igual ao ID logado
    const query = database
      .collection("transactions")
      .where("associatedUser", "==", userId)
      .orderBy("date", "desc"); // Ordena pela data, mais recente primeiro

    const querySnapshot = await query.get();

    const transactions = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).send(transactions);
  } catch (error) {
    console.error("Erro ao listar transações:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao listar transações.",
      error: error.message,
    });
  }
});

app.get("/transactions/:id", authenticate, async (req, res) => {
  try {
    const transactionId = req.params.id;
    const userId = req.user.user_id;

    const docRef = database.collection("transactions").doc(transactionId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "Transação não encontrada." });
    }

    const transactionData = { id: doc.id, ...doc.data() };

    // ⭐️ VERIFICAÇÃO DE PROPRIEDADE: Garante que o usuário só veja suas próprias transações
    if (transactionData.associatedUser !== userId) {
      return res.status(403).send({
        message: "Acesso negado. Esta transação não pertence ao seu usuário.",
      });
    }

    return res.status(200).send(transactionData);
  } catch (error) {
    console.error("Erro ao buscar transação:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao buscar transação.",
      error: error.message,
    });
  }
});

app.put("/transactions/:id", authenticate, async (req, res) => {
  try {
    const transactionId = req.params.id;
    const userId = req.user.user_id;
    const updateData = req.body;

    const docRef = database.collection("transactions").doc(transactionId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "Transação não encontrada." });
    }

    // ⭐️ VERIFICAÇÃO DE PROPRIEDADE
    if (doc.data().associatedUser !== userId) {
      return res.status(403).send({
        message:
          "Acesso negado. Você só pode atualizar suas próprias transações.",
      });
    }

    // Previne que o usuário mude o campo de associação
    delete updateData.associatedUser;

    await docRef.update(updateData);

    return res.status(200).send({
      message: `Transação com ID ${transactionId} atualizada com sucesso.`,
    });
  } catch (error) {
    console.error("Erro ao atualizar transação:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao atualizar transação.",
      error: error.message,
    });
  }
});

app.delete("/transactions/:id", authenticate, async (req, res) => {
  try {
    const transactionId = req.params.id;
    const userId = req.user.user_id;

    const docRef = database.collection("transactions").doc(transactionId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "Transação não encontrada." });
    }

    // ⭐️ VERIFICAÇÃO DE PROPRIEDADE
    if (doc.data().associatedUser !== userId) {
      return res.status(403).send({
        message:
          "Acesso negado. Você só pode excluir suas próprias transações.",
      });
    }

    await docRef.delete();

    return res.status(200).send({
      message: `Transação com ID ${transactionId} excluída com sucesso.`,
    });
  } catch (error) {
    console.error("Erro ao excluir transação:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao excluir transação.",
      error: error.message,
    });
  }
});

// INVESTIMENTOS

exports.app = onRequest(app);

app.post("/investments", authenticate, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const newInvestmentData = {
      // Campos de Investimento:
      type: req.body.type, // Tipo (ex: 'stock', 'bond', 'fund')
      value: req.body.value,
      name: req.body.name,
      accountId: req.body.accountId, // ID da conta bancária/corretora associada

      // ⭐️ Associa o investimento ao usuário logado:
      associatedUser: userId,

      // Data de criação
      createdAt: new Date().toISOString(),
    };

    const docRef = await database
      .collection("investments")
      .add(newInvestmentData);

    return res.status(201).send({
      message: "Investimento registrado com sucesso.",
      id: docRef.id,
    });
  } catch (error) {
    console.error("Erro ao criar investimento:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao registrar investimento.",
      error: error.message,
    });
  }
});

app.get("/investments", authenticate, async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Busca investimentos onde associatedUser é igual ao ID logado
    const query = database
      .collection("investments")
      .where("associatedUser", "==", userId)
      .orderBy("createdAt", "desc");

    const querySnapshot = await query.get();

    const investments = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).send(investments);
  } catch (error) {
    console.error("Erro ao listar investimentos:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao listar investimentos.",
      error: error.message,
    });
  }
});

app.get("/investments/:id", authenticate, async (req, res) => {
  try {
    const investmentId = req.params.id;
    const userId = req.user.user_id;

    const docRef = database.collection("investments").doc(investmentId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "Investimento não encontrado." });
    }

    const investmentData = { id: doc.id, ...doc.data() };

    // ⭐️ VERIFICAÇÃO DE PROPRIEDADE
    if (investmentData.associatedUser !== userId) {
      return res.status(403).send({
        message:
          "Acesso negado. Este investimento não pertence ao seu usuário.",
      });
    }

    return res.status(200).send(investmentData);
  } catch (error) {
    console.error("Erro ao buscar investimento:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao buscar investimento.",
      error: error.message,
    });
  }
});

app.put("/investments/:id", authenticate, async (req, res) => {
  try {
    const investmentId = req.params.id;
    const userId = req.user.user_id;
    const updateData = req.body;

    const docRef = database.collection("investments").doc(investmentId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "Investimento não encontrado." });
    }

    // ⭐️ VERIFICAÇÃO DE PROPRIEDADE
    if (doc.data().associatedUser !== userId) {
      return res.status(403).send({
        message:
          "Acesso negado. Você só pode atualizar seus próprios investimentos.",
      });
    }

    // Previne a mudança do campo de associação por segurança
    delete updateData.associatedUser;

    await docRef.update(updateData);

    return res.status(200).send({
      message: `Investimento com ID ${investmentId} atualizado com sucesso.`,
    });
  } catch (error) {
    console.error("Erro ao atualizar investimento:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao atualizar investimento.",
      error: error.message,
    });
  }
});

app.delete("/investments/:id", authenticate, async (req, res) => {
  try {
    const investmentId = req.params.id;
    const userId = req.user.user_id;

    const docRef = database.collection("investments").doc(investmentId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "Investimento não encontrado." });
    }

    // ⭐️ VERIFICAÇÃO DE PROPRIEDADE
    if (doc.data().associatedUser !== userId) {
      return res.status(403).send({
        message:
          "Acesso negado. Você só pode excluir seus próprios investimentos.",
      });
    }

    await docRef.delete();

    return res.status(200).send({
      message: `Investimento com ID ${investmentId} excluído com sucesso.`,
    });
  } catch (error) {
    console.error("Erro ao excluir investimento:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao excluir investimento.",
      error: error.message,
    });
  }
});

