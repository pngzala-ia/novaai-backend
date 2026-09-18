const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const multer = require("multer");
const crypto = require("crypto");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) console.warn("⚠️ OPENAI_API_KEY não configurada.");

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || origin === "null") {
      return callback(null, true);
    }

    return callback(null, true);
  },
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json({ limit: "12mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Envie somente uma imagem."));
    }
  }
});

/* Dados sociais temporários em memória. */
const posts = [];
const statuses = [];

function id() {
  return crypto.randomUUID();
}

function timeNow() {
  return new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function createItem(image, caption) {
  return {
    id: id(),
    image,
    caption: caption || "",
    likes: 0,
    liked: false,
    comments: [],
    createdAt: timeNow()
  };
}

function find(list, itemId) {
  return list.find(item => item.id === itemId);
}

function validImage(image) {
  return typeof image === "string" && image.startsWith("data:image/");
}

/* =====================================================
   STATUS DO SERVIDOR
===================================================== */

app.get("/", (req, res) => {
  res.json({
    status: "online",
    app: "NovaAI + GeraçãoZ",
    openai: !!OPENAI_API_KEY,
    social: true
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    openai: !!OPENAI_API_KEY,
    social: true
  });
});

/* =====================================================
   CHAT DA NOVAAI
===================================================== */

app.post("/api/chat", async (req, res) => {
  try {
    const message =
      typeof req.body.message === "string"
        ? req.body.message.trim()
        : "";

    if (!message)
      return res.status(400).json({
        error: "Digite uma mensagem."
      });

    if (!OPENAI_API_KEY)
      return res.status(500).json({
        error: "OPENAI_API_KEY não configurada no servidor."
      });

    /*
     * Histórico enviado pelo aplicativo.
     * Mantemos somente as últimas 20 mensagens.
     */
    const rawHistory = Array.isArray(req.body.history)
      ? req.body.history.slice(-20)
      : [];

    const history = rawHistory
      .filter(item =>
        item &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string" &&
        item.content.trim()
      )
      .map(item => ({
        role: item.role,
        content: item.content.trim()
      }));

    const projectContext = `
PROJETO ATUAL:
Você é a NovaAI integrada ao aplicativo GeraçãoZ.

COMO DEVE ENTENDER O USUÁRIO:
- Considere o histórico da conversa antes de responder.
- Quando o usuário disser "isso", "aquilo", "aquele", "aquela", "o anterior",
  "a versão anterior", "o código que fizemos", "essa parte" ou expressão
  semelhante, tente identificar a referência pelo contexto da conversa.
- Não trate cada mensagem como um pedido isolado.
- Se houver duas interpretações realmente possíveis e o histórico não resolver,
  faça uma pergunta curta para esclarecer antes de executar.
- Não invente alterações que o usuário não pediu.
- Quando o usuário estiver trabalhando no código, preserve o que já funciona
  e proponha ou faça somente as alterações necessárias.
- Se o usuário corrigir uma interpretação, use a correção nas mensagens seguintes.
- Responda em português do Brasil, salvo se o usuário pedir outro idioma.
- Seja clara, natural e objetiva.
`;

    /*
     * O histórico é convertido para um texto explícito.
     */
    const conversationContext = history.length
      ? `
HISTÓRICO RECENTE DA CONVERSA:
${history.map(item =>
  `${item.role === "user" ? "Usuário" : "NovaAI"}: ${item.content}`
).join("\n")}
`
      : "HISTÓRICO RECENTE: nenhuma mensagem anterior disponível.";

    const response = await openai.responses.create({
      model: "gpt-5.6-luna",
      instructions: projectContext,
      input: `${conversationContext}

MENSAGEM ATUAL DO USUÁRIO:
${message}`
    });

    const answer = response.output_text;

    if (!answer)
      return res.status(502).json({
        error: "A API não retornou texto."
      });

    res.json({
      response: answer,
      output_text: answer
    });

  } catch (error) {
    console.error("ERRO /api/chat:", error);

    res.status(500).json({
      error: error?.message ||
        "Erro ao conversar com a NovaAI."
    });
  }
});

/* =====================================================
   GERAR IMAGEM
===================================================== */

app.post("/api/image", async (req, res) => {
  try {
    const prompt =
      typeof req.body.prompt === "string"
        ? req.body.prompt.trim()
        : "";

    if (!prompt)
      return res.status(400).json({
        error: "Informe o que você quer criar."
      });

    if (!OPENAI_API_KEY)
      return res.status(500).json({
        error: "OPENAI_API_KEY não configurada no servidor."
      });

    const requestedCount =
      Number.parseInt(req.body.count, 10);

    const count = Number.isFinite(requestedCount)
      ? Math.min(4, Math.max(1, requestedCount))
      : 1;

    const results = await Promise.all(
      Array.from({ length: count }, () =>
        openai.images.generate({
          model: "gpt-image-2",
          prompt,
          size: "1024x1024"
        })
      )
    );

    const images = results
      .map(result => result?.data?.[0]?.b64_json)
      .filter(Boolean)
      .map(base64 => "data:image/png;base64," + base64);

    if (!images.length)
      throw new Error(
        "A API não retornou os dados das imagens."
      );

    res.json({
      success: true,
      images,
      image: images[0],
      imageUrl: images[0],
      url: images[0]
    });

  } catch (error) {
    console.error("ERRO /api/image:", error);

    res.status(500).json({
      error: error?.message ||
        "Não foi possível gerar a imagem."
    });
  }
});

/* =====================================================
   EDITAR IMAGEM
===================================================== */

app.post("/api/image/edit", upload.single("image"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({
        error: "Nenhuma imagem foi enviada."
      });

    if (!OPENAI_API_KEY)
      return res.status(500).json({
        error: "OPENAI_API_KEY não configurada no servidor."
      });

    const prompt =
      typeof req.body.prompt === "string" &&
      req.body.prompt.trim()
        ? req.body.prompt.trim()
        : "Edite esta imagem de forma criativa.";

    const file = new File(
      [req.file.buffer],
      req.file.originalname || "imagem.png",
      {
        type: req.file.mimetype || "image/png"
      }
    );

    const result = await openai.images.edit({
      model: "gpt-image-2",
      image: file,
      prompt,
      size: "1024x1024"
    });

    const imageData =
      result?.data?.[0]?.b64_json;

    if (!imageData)
      throw new Error(
        "A API não retornou a imagem editada."
      );

    const image =
      "data:image/png;base64," + imageData;

    res.json({
      success: true,
      image,
      imageUrl: image,
      url: image
    });

  } catch (error) {
    console.error(
      "ERRO /api/image/edit:",
      error
    );

    res.status(500).json({
      error: error?.message ||
        "Não foi possível editar a imagem."
    });
  }
});

/* =====================================================
   POSTS / FEED / PERFIL
===================================================== */

app.get("/api/posts", (req, res) => {
  res.json({
    success: true,
    posts
  });
});

app.post("/api/posts", (req, res) => {
  const image = req.body.image;

  const caption =
    typeof req.body.caption === "string"
      ? req.body.caption.trim()
      : "";

  if (!validImage(image))
    return res.status(400).json({
      error: "Nenhuma imagem válida foi enviada."
    });

  const post = createItem(image, caption);

  posts.unshift(post);

  res.status(201).json({
    success: true,
    post
  });
});

app.delete("/api/posts/:id", (req, res) => {
  const index = posts.findIndex(
    p => p.id === req.params.id
  );

  if (index < 0)
    return res.status(404).json({
      error: "Publicação não encontrada."
    });

  posts.splice(index, 1);

  res.json({
    success: true
  });
});

app.post("/api/posts/:id/like", (req, res) => {
  const post = find(
    posts,
    req.params.id
  );

  if (!post)
    return res.status(404).json({
      error: "Publicação não encontrada."
    });

  post.liked = !post.liked;

  post.likes = Math.max(
    0,
    post.likes +
      (post.liked ? 1 : -1)
  );

  res.json({
    success: true,
    liked: post.liked,
    likes: post.likes
  });
});

app.post("/api/posts/:id/comments", (req, res) => {
  const post = find(
    posts,
    req.params.id
  );

  const text =
    typeof req.body.text === "string"
      ? req.body.text.trim()
      : "";

  if (!post)
    return res.status(404).json({
      error: "Publicação não encontrada."
    });

  if (!text)
    return res.status(400).json({
      error: "Digite um comentário."
    });

  if (text.length > 500)
    return res.status(400).json({
      error:
        "O comentário deve ter no máximo 500 caracteres."
    });

  const comment = {
    id: id(),
    name: "Você",
    text,
    createdAt: timeNow()
  };

  post.comments.push(comment);

  res.status(201).json({
    success: true,
    comment
  });
});
// ==============================
// STATUS
// ==============================

app.get("/api/status", (req, res) => {
  res.json(statuses);
});

app.post("/api/status", (req, res) => {
  try {
    const { image, caption } = req.body || {};

    if (!validImage(image)) {
      return res.status(400).json({
        error: "Imagem inválida."
      });
    }

    const item = createItem(image, caption);
    statuses.unshift(item);

    res.json(item);

  } catch (error) {
    console.error("ERRO POST /api/status:", error);

    res.status(500).json({
      error: "Erro ao publicar status."
    });
  }
});

app.delete("/api/status/:id", (req, res) => {
  const index = statuses.findIndex(
    item => String(item.id) === String(req.params.id)
  );

  if (index === -1) {
    return res.status(404).json({
      error: "Status não encontrado."
    });
  }

  statuses.splice(index, 1);

  res.json({
    ok: true
  });
});

app.post("/api/status/:id/like", (req, res) => {
  const item = find(statuses, req.params.id);

  if (!item) {
    return res.status(404).json({
      error: "Status não encontrado."
    });
  }

  item.liked = !item.liked;

  item.likes = Math.max(
    0,
    Number(item.likes || 0) + (item.liked ? 1 : -1)
  );

  res.json(item);
});

app.post("/api/status/:id/comments", (req, res) => {
  const item = find(statuses, req.params.id);

  if (!item) {
    return res.status(404).json({
      error: "Status não encontrado."
    });
  }

  const text =
    typeof req.body?.text === "string"
      ? req.body.text.trim()
      : "";

  if (!text) {
    return res.status(400).json({
      error: "Comentário vazio."
    });
  }

  const comment = {
    id: id(),
    text,
    likes: 0,
    liked: false,
    createdAt: timeNow()
  };

  item.comments.push(comment);

  res.json(comment);
});


// ==============================
// ERRO DE UPLOAD
// ==============================

app.use((error, req, res, next) => {
  console.error("ERRO:", error);

  if (error instanceof multer.MulterError) {

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "A imagem é muito grande. O limite é 10 MB."
      });
    }

    return res.status(400).json({
      error: error.message
    });
  }

  if (error) {
    return res.status(500).json({
      error: error.message ||
        "Erro interno do servidor."
    });
  }

  next();
});


// ==============================
// INICIAR SERVIDOR
// ==============================

app.listen(PORT, () => {
  console.log("");
  console.log("====================================");
  console.log("🚀 NovaAI Backend iniciado");
  console.log("====================================");
  console.log(`🌐 Porta: ${PORT}`);
  console.log(
    `🔑 OPENAI_API_KEY: ${
      OPENAI_API_KEY ? "CONFIGURADA" : "NÃO CONFIGURADA"
    }`
  );
  console.log("====================================");
});
  if (index < 0)
    return res.status(404).json({
      error: "Publicação não encontrada."
    });

  posts.splice(index, 1);
  res.json({ success: true });
});

app.post("/api/posts/:id/like", (req, res) => {
  const post = find(posts, req.params.id);

  if (!post)
    return res.status(404).json({
      error: "Publicação não encontrada."
    });

  post.liked = !post.liked;
  post.likes = Math.max(0, post.likes + (post.liked ? 1 : -1));

  res.json({
    success: true,
    liked: post.liked,
    likes: post.likes
  });
});

app.post("/api/posts/:id/comments", (req, res) => {
  const post = find(posts, req.params.id);
  const text =
    typeof req.body.text === "string" ? req.body.text.trim() : "";

  if (!post)
    return res.status(404).json({
      error: "Publicação não encontrada."
    });

  if (!text)
    return res.status(400).json({
      error: "Digite um comentário."
    });

  if (text.length > 500)
    return res.status(400).json({
      error: "O comentário deve ter no máximo 500 caracteres."
    });

  const comment = {
    id: id(),
    name: "Você",
    text,
    createdAt: timeNow()
  };

  post.comments.push(comment);

  res.status(201).json({
    success: true,
    comment
  });
});

/* =====================================================
   STATUS
===================================================== */

app.get("/api/status", (req, res) => {
  res.json({ success: true, statuses });
});

app.post("/api/status", (req, res) => {
  const image = req.body.image;
  const caption =
    typeof req.body.caption === "string" ? req.body.caption.trim() : "";

  if (!validImage(image))
    return res.status(400).json({
      error: "Nenhuma imagem válida foi enviada."
    });

  const status = createItem(image, caption);
  statuses.unshift(status);

  res.status(201).json({
    success: true,
    status
  });
});

app.delete("/api/status/:id", (req, res) => {
  const index = statuses.findIndex(s => s.id === req.params.id);

  if (index < 0)
    return res.status(404).json({
      error: "Status não encontrado."
    });

  statuses.splice(index, 1);
  res.json({ success: true });
});

app.post("/api/status/:id/like", (req, res) => {
  const status = find(statuses, req.params.id);

  if (!status)
    return res.status(404).json({
      error: "Status não encontrado."
    });

  status.liked = !status.liked;
  status.likes = Math.max(0, status.likes + (status.liked ? 1 : -1));

  res.json({
    success: true,
    liked: status.liked,
    likes: status.likes
  });
});

app.post("/api/status/:id/comments", (req, res) => {
  const status = find(statuses, req.params.id);
  const text =
    typeof req.body.text === "string" ? req.body.text.trim() : "";

  if (!status)
    return res.status(404).json({
      error: "Status não encontrado."
    });

  if (!text)
    return res.status(400).json({
      error: "Digite um comentário."
    });

  if (text.length > 500)
    return res.status(400).json({
      error: "O comentário deve ter no máximo 500 caracteres."
    });

  const comment = {
    id: id(),
    name: "Você",
    text,
    createdAt: timeNow()
  };

  status.comments.push(comment);

  res.status(201).json({
    success: true,
    comment
  });
});

/* =====================================================
   ERROS
===================================================== */

app.use((error, req, res, next) => {
  console.error("ERRO DO SERVIDOR:", error);

  if (error?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: "A imagem é muito grande. Limite: 10 MB."
    });
  }

  res.status(500).json({
    error: error?.message || "Erro interno do servidor."
  });
});

app.listen(PORT, () => {
  console.log("=================================");
  console.log("🚀 NovaAI + GeraçãoZ online");
  console.log("Porta:", PORT);
  console.log("OpenAI:", OPENAI_API_KEY ? "CONFIGURADA" : "NÃO CONFIGURADA");
  console.log("Feed: ATIVO");
  console.log("Status: ATIVO");
  console.log("Curtidas: ATIVAS");
  console.log("Comentários: ATIVOS");
  console.log("Excluir: ATIVO");
  console.log("=================================");
});
