/* =========================================================================
 * ⚙️ CONFIGURAÇÕES E IMPORTS GLOBAIS
 * ========================================================================= */

/* eslint-disable no-unused-vars */
/* eslint-disable valid-jsdoc */
/* eslint-disable object-curly-spacing */
/* eslint-disable max-len */
/* eslint-disable indent */

// Dependências do Firebase Cloud Functions
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const functions = require("firebase-functions");

// Dependências do Firebase Admin SDK
const admin = require("firebase-admin");

// Dependências de Utilidades e Servidor
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const multer = require("multer"); // Multer não está sendo usado nas rotas, mas é mantido como dependência.

// Dependências para Upload (Busboy)
const busboy = require("busboy");
const path = require("path");
const os = require("os");
const fs = require("fs");

// Configurações Globais para a 2ª Geração (se aplicável)
setGlobalOptions({ maxInstances: 10 });

// Arquivo de Permissões
const serviceAccount = require("./permisions.json");
const { uid } = require("uuid");

/* -------------------------------------------------------------------------
 * 🚀 INICIALIZAÇÃO E CONFIGURAÇÃO DO FIREBASE ADMIN
 * ------------------------------------------------------------------------- */

// Inicialização do Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "api-prime-bank.firebasestorage.app", // Seu bucket do Storage
});

// Instâncias Globais do Firebase
const database = admin.firestore();
const bucket = admin.storage().bucket();

/* -------------------------------------------------------------------------
 * 🌐 CONFIGURAÇÃO DO SERVIDOR EXPRESS (API Principal)
 * ------------------------------------------------------------------------- */

const app = express();

// Middlewares
app.use(cors({ origin: true }));

/* -------------------------------------------------------------------------
 * 🛡️ MIDDLEWARE DE AUTENTICAÇÃO
 * ------------------------------------------------------------------------- */

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
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log({ decodedToken });
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Erro ao verificar o Token de ID:", error);
    return res.status(401).send({ message: "Token inválido ou expirado." });
  }
};

/**
 * Função auxiliar que verifica o token de ID e retorna os dados do usuário.
 * @param {object} req O objeto de requisição (req).
 * @returns {object} O token decodificado (decodedToken).
 * @throws {Error} Se o token for inválido ou ausente.
 */
async function getAuthenticatedUser(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Acesso negado. Token não fornecido ou formato inválido.");
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken; // <-- Retorna o token decodificado!
  } catch (error) {
    console.error("Erro ao verificar o Token de ID:", error);
    // Lançamos um erro com a mensagem que queremos exibir
    throw new Error("Token inválido ou expirado.");
  }
}

/* =========================================================================
 * 🛣️ ROTAS DA API (EXPRESS)
 * ========================================================================= */

// ---------------------------------------------------------------------------> Rotas USERS
// Post (CREATE): Cria usuário e uma conta bancária inicial
app.post("/users", async (req, res) => {
  const { fullName, email, password, telephone, acceptTermAndPolice } =
    req.body;

  try {
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: fullName,
      // Você pode definir o emailVerified como true se tiver um processo de verificação externo
      emailVerified: false,
      disabled: false,
    });

    const userDocRef = database.collection("users").doc(userRecord.uid);

    await userDocRef.set({
      fullName: fullName,
      email: email,
      telephone: telephone,
      acceptTermAndPolice: acceptTermAndPolice,
      createdAt: new Date().toISOString(),
    });

    const newAccountData = {
      associatedUser: userRecord.uid,
      name: fullName,
      balance: 4000,
      createdAt: new Date().toISOString(),
    };

    const accountRef = await database
      .collection("bankAccounts")
      .add(newAccountData);

    return res.status(200).send({
      message: "Usuário e Conta Principal criados com sucesso!",
      userId: userRecord.uid,
      bankAccountId: accountRef.id,
      bankAccountNumber: crypto.randomUUID(),
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send(error);
  }
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

// read user by ID
app.get("/users/:id", authenticate, async (req, res) => {
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

// Update user
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

// Delete user
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

// ---------------------------------------------------------------------------> Rotas CONTA BANCÁRIA
// Create bank account
app.post("/bankAccounts", authenticate, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { initialBalance } = req.body;

    const newAccountData = {
      associatedUser: userId,
      balance: parseFloat(initialBalance) || 5000,
      createdAt: new Date(),
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

// Read all bank accounts
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

// Read bank account by ID
app.get("/bankAccounts/:id", authenticate, async (req, res) => {
  try {
    const accountDocId = req.params.id;
    const userId = req.user.user_id;

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

// ---------------------------------------------------------------------------> Rotas TRANSACTIONS
// Create transaction (Transferência)
app.post("/transactions", authenticate, async (req, res) => {
  const userId = req.user.user_id;
  const { fromAccountId, toAccountId, amount, category } = req.body;
  let fileUrl;
  let fileName;

  if (!fromAccountId || !toAccountId || !amount || amount <= 0) {
    return res
      .status(400)
      .send({ message: "Dados de transação inválidos ou incompletos." });
  }

  const fromAccountRef = database.collection("bankAccounts").doc(fromAccountId);
  const toAccountRef = database.collection("bankAccounts").doc(toAccountId);
  // content-type': 'multipart/form-data
  try {
    // if (req.headers["content-type"] === "multipart/form-data") {
    //   const response = await fetch(
    //     "http://127.0.0.1:5001/api-prime-bank/us-central1/uploadFile",
    //     {
    //       method: "POST",
    //     }
    //   );

    //   console.log({ response });
    // }

    const transactionRefs = await database.runTransaction(
      async (transaction) => {
        const fromDoc = await transaction.get(fromAccountRef);
        const toDoc = await transaction.get(toAccountRef);

        if (!fromDoc.exists || !toDoc.exists) {
          throw new Error("Uma das contas bancárias não foi encontrada.");
        }

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

        const senderUID = fromDoc.data().associatedUser;
        const receiverUID = toDoc.data().associatedUser;
        const dateString = new Date();
        const baseTransactionRef = database.collection("transactions").doc();

        const senderTransactionData = {
          fromAccountId: fromAccountId,
          toAccountId: toAccountId,
          amount: transferAmount,
          date: dateString,
          fileName: fileName || null,
          fileUrl: fileUrl || null,
          associatedUser: senderUID,
          type: "sended",
          createdAt: dateString,
          name: fromDoc.data().name,
          category: category,
        };

        transaction.set(baseTransactionRef, senderTransactionData);

        const receiverTransactionData = {
          fromAccountId: fromAccountId,
          toAccountId: toAccountId,
          amount: transferAmount,
          date: dateString,
          fileName: fileName || null,
          fileUrl: fileUrl || null,
          associatedUser: receiverUID,
          type: "received",
          createdAt: dateString,
          name: toDoc.data().name,
          category: category,
        };

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

// Read all transactions with filters and pagination
app.get("/transactions", authenticate, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { minAmount, maxAmount, month, itemsPerPage, lastItemId } = req.query;

    const minAmountValue = minAmount ? parseFloat(minAmount) : null;
    const maxAmountValue = maxAmount ? parseFloat(maxAmount) : null;
    const pageSize = parseInt(itemsPerPage, 10) || 100;

    let query = database
      .collection("transactions")
      .where("associatedUser", "==", userId)
      .orderBy("date", "desc");

    // 1. Aplicação dos Filtros de Quantidade
    if (minAmountValue !== null) {
      query = query.where("amount", ">=", minAmountValue);
    }
    if (maxAmountValue !== null) {
      query = query.where("amount", "<=", maxAmountValue);
    }

    // 2. Aplicação do Filtro por Mês
    if (month) {
      const [monthStr, yearStr] = month.split("-");
      const monthNum = parseInt(monthStr, 10);
      let yearNum = parseInt(yearStr, 10);

      if (yearNum < 100) {
        yearNum += 2000;
      }

      if (monthNum >= 1 && monthNum <= 12 && yearNum) {
        const start = new Date(yearNum, monthNum - 1, 1);
        const end = new Date(yearNum, monthNum, 1);

        const startTimestamp = admin.firestore.Timestamp.fromDate(start);
        const endTimestamp = admin.firestore.Timestamp.fromDate(end);

        query = query.where("date", ">=", startTimestamp);
        query = query.where("date", "<", endTimestamp);
      }
    }

    // 3. Paginação
    if (lastItemId) {
      const cursorDoc = await database
        .collection("transactions")
        .doc(lastItemId)
        .get();

      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    query = query.limit(pageSize);

    // 4. Execução
    const querySnapshot = await query.get();

    const transactions = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // 5. Retorno da Paginação
    const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
    const nextCursorId = lastDoc ? lastDoc.id : null;
    const hasMore = querySnapshot.docs.length === pageSize;

    return res.status(200).send({
      data: transactions,
      pagination: {
        itemsPerPage: pageSize,
        nextCursorId: nextCursorId,
        hasMore: hasMore,
      },
    });
  } catch (error) {
    console.error("Erro ao listar transações:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao listar transações.",
      error: error.message,
    });
  }
});

// Read transaction by ID
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

    // ⭐️ VERIFICAÇÃO DE PROPRIEDADE
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

// Update transaction
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

// Delete transaction
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

// ---------------------------------------------------------------------------> Rotas INVESTMENTS
// Create investment
// app.post("/investments", authenticate, async (req, res) => {
//   try {
//     const userId = req.user.user_id;

//     const newInvestmentData = {
//       type: type,
//       value: req.body.value,
//       name: req.body.name,
//       accountId: req.body.accountId,
//       associatedUser: userId,
//       createdAt: new Date().toISOString(),
//     };

//     const docRef = await database
//       .collection("investments")
//       .add(newInvestmentData);

//     return res.status(201).send({
//       message: "Investimento registrado com sucesso.",
//       id: docRef.id,
//     });
//   } catch (error) {
//     console.error("Erro ao criar investimento:", error);
//     return res.status(500).send({
//       message: "Erro interno do servidor ao registrar investimento.",
//       error: error.message,
//     });
//   }
// });

// Read all investments
app.get("/investments", authenticate, async (req, res) => {
  try {
    const userId = req.user.user_id;

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

// Read investment by ID
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

// Update investment
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

// Delete investment
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

/* =========================================================================
 * 🖼️ FUNÇÃO DE UPLOAD (BUSBOY)
 * ========================================================================= */

// exports.uploadFile = functions.https.onRequest(async (req, res) => {
//   // Remova o 'next' daqui, pois não é uma função Express
//   if (req.method !== "POST") {
//     return res.status(405).send("Método não permitido. Use POST.");
//   }

//   // ⚠️ Remova a definição da função 'authenticate' antiga daqui

//   // 1. AUTENTICAÇÃO: Chamada da função auxiliar
//   let userId = null;
//   try {
//     // Chamamos a nova função que retorna o token ou lança um erro.
//     const decodedToken = await getAuthenticatedUser(req);
//     userId = decodedToken.uid; // Agora funciona!
//   } catch (error) {
//     // Se a autenticação falhar, retorna o erro (e o error.message é o que queremos)
//     return res.status(401).send({ message: error.message });
//   }

//   // Se chegou aqui, o usuário está autenticado e temos o 'userId'

//   // 2. INÍCIO DO BUSBOY...
//   const busboyHeaders = busboy({
//     headers: req.headers,
//     limits: {
//       fileSize: 10 * 1024 * 1024, // 10MB
//     },
//   });

//   // ... (restante do código do Busboy: on("field"), on("file"), on("finish")) ...
//   // Certifique-se de usar o restante do seu código Busboy aqui, sem a definição do middleware 'authenticate' dentro.
//   // ...

//   const fields = {};
//   const uploads = {};

//   busboyHeaders.on("field", (fieldname, val) => {
//     fields[fieldname] = val;
//   });

//   busboyHeaders.on("file", (fieldname, file, info) => {
//     // Usar 'file' ou 'attachment' como nome do campo
//     if (fieldname !== "file" && fieldname !== "attachment") {
//       file.resume();
//       return;
//     }

//     const { filename, mimeType } = info;
//     const uniqueFileName = `${Date.now()}-${filename.replace(/ /g, "_")}`;
//     const filepath = path.join(os.tmpdir(), uniqueFileName);

//     uploads.file = {
//       originalName: filename,
//       filename: uniqueFileName,
//       mimeType: mimeType,
//       filepath: filepath,
//     };

//     file.pipe(fs.createWriteStream(filepath));
//   });

//   busboyHeaders.on("finish", async () => {
//     try {
//       if (!uploads.file) {
//         return res.status(400).send({
//           message: "Nenhum arquivo enviado ou campo de arquivo incorreto.",
//         });
//       }

//       const { filename, mimeType, filepath, originalName } = uploads.file;

//       // 3. ASSOCIAÇÃO: Usa o UID na pasta de destino
//       const destinationPath = `files/${userId}/${filename}`;

//       const metadata = {
//         contentType: mimeType,
//         metadata: {
//           firebaseStorageDownloadTokens: require("uuid").v4(),
//           originalName: originalName,
//           uploadedBy: userId, // Salva o UID nos metadados do arquivo
//         },
//       };

//       await bucket.upload(filepath, {
//         destination: destinationPath,
//         metadata: metadata,
//         gzip: true,
//       });

//       const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${
//         bucket.name
//       }/o/${encodeURIComponent(destinationPath)}?alt=media&token=${
//         metadata.metadata.firebaseStorageDownloadTokens
//       }`;

//       // 4. ATUALIZAR O FIRESTORE
//       // --------------------------------------------------------------------------------------------------
//       // ATENÇÃO: É crucial que a variável 'db' esteja definida e seja o resultado de admin.firestore()
//       // Se não estiver definida, você deve adicionar: const db = admin.firestore(); no topo do arquivo.
//       // --------------------------------------------------------------------------------------------------

//       const userRef = database.collection("users").doc(userId);

//       await userRef.update({
//         // Adicionando 'fileUrl' para a URL pública
//         fileUrl: publicUrl,
//         // Adicionando 'fileName' para o nome único do arquivo no Storage
//         fileName: filename,
//         updatedAt: admin.firestore.FieldValue.serverTimestamp(),
//       });

//       // --------------------------------------------------------------------------------------------------

//       fs.unlinkSync(filepath);

//       res.status(200).send({
//         message:
//           "Upload de arquivo realizado com sucesso e usuário atualizado!",
//         userId: userId,
//         fileName: filename,
//         url: publicUrl,
//         path: destinationPath,
//       });
//     } catch (error) {
//       console.error(
//         "Erro no upload, processamento ou atualização do Firestore:",
//         error,
//       );
//       if (uploads.file && fs.existsSync(uploads.file.filepath)) {
//         fs.unlinkSync(uploads.file.filepath);
//       }
//       res.status(500).send({
//         message: "Falha no upload do arquivo ou na atualização do usuário.",
//         error: error.message,
//       });
//     }
//   });

//   busboyHeaders.end(req.rawBody);
// });

/* =========================================================================
 * 📤 EXPORTAÇÃO DAS CLOUD FUNCTIONS
 * ========================================================================= */

/**
 * Cloud Function para a API REST (Express).
 * Roteia todas as requisições HTTP para o nosso app Express.
 */
// exports.app = onRequest(app);

// A função 'uploadImage' já foi exportada acima.

