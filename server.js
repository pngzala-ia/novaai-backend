const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const multer = require("multer");
const crypto = require("crypto");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

const db = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
    })
  : null;

if (!OPENAI_API_KEY) console.warn("⚠️ OPENAI_API_KEY não configurada.");
if (!DATABASE_URL) console.warn("⚠️ DATABASE_URL não configurada. As contas não poderão ser usadas.");
if (!JWT_SECRET) console.warn("⚠️ JWT_SECRET não configurada. As sessões de conta não poderão ser usadas.");

async function initDatabase() {
  if (!db) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS post_likes (
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (post_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS comment_likes (
      comment_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (comment_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      username VARCHAR(30) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      plan VARCHAR(20) NOT NULL DEFAULT 'base',
      tag VARCHAR(60) DEFAULT '',
      followers_count INTEGER NOT NULL DEFAULT 0,
      following_count INTEGER NOT NULL DEFAULT 0,
      likes_count INTEGER NOT NULL DEFAULT 0,
      posts_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS direct_messages (
      id UUID PRIMARY KEY,
      sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS direct_messages_pair_idx
      ON direct_messages(sender_id, receiver_id, created_at);

    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY,
      recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
      type VARCHAR(30) NOT NULL,
      title TEXT NOT NULL,
      text TEXT DEFAULT '',
      target_id TEXT DEFAULT '',
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS notifications_recipient_idx
      ON notifications(recipient_id, created_at DESC);
  `);

  console.log("✅ Banco de dados de contas pronto.");
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    avatar: user.avatar || "",
    bio: user.bio || "",
    plan: user.plan,
    tag: user.tag || "",
    followers: user.followers_count,
    following: user.following_count,
    likes: user.likes_count,
    publications: user.posts_count,
    createdAt: user.created_at
  };
}

function signToken(user) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET não configurada no servidor.");
  return jwt.sign(
    { sub: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function authRequired(req, res, next) {
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({ error: "JWT_SECRET não configurada no servidor." });
    }

    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

    if (!token) {
      return res.status(401).json({ error: "Faça login para continuar." });
    }

    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ error: "Sessão inválida ou expirada." });
  }
}


const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const corsOptions = {
  origin: function (origin, callback) {
    // O TrebEdit pode enviar Origin: null quando o HTML é aberto como file://
    if (!origin || origin === "null") {
      return callback(null, true);
    }

    // Mantém o acesso dos demais frontends durante o desenvolvimento
    return callback(null, true);
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
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
    if (file.mimetype && file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Envie somente uma imagem."));
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

function createItem(image, caption, userId, userName, username, avatar) {
  return {
    id: id(),
    image,
    caption: caption || "",
    userId: userId ? String(userId) : "",
    userName: userName || "",
    username: username || "",
    avatar: avatar || "",
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
    social: true,
    database: !!db
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
   CONTAS / AUTENTICAÇÃO
===================================================== */

app.post("/api/auth/register", async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: "Banco de dados não configurado no servidor." });
    if (!JWT_SECRET) return res.status(500).json({ error: "JWT_SECRET não configurada no servidor." });

    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const username = normalizeUsername(req.body.username);
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (name.length < 2 || name.length > 80)
      return res.status(400).json({ error: "O nome deve ter entre 2 e 80 caracteres." });

    if (!/^[a-z0-9._]{3,30}$/.test(username))
      return res.status(400).json({ error: "O @usuário deve ter 3 a 30 caracteres e usar apenas letras, números, ponto ou _." });

    if (!validEmail(email))
      return res.status(400).json({ error: "Digite um e-mail válido." });

    if (password.length < 8 || password.length > 72)
      return res.status(400).json({ error: "A senha deve ter entre 8 e 72 caracteres." });

    const exists = await db.query(
      "SELECT id FROM users WHERE username = $1 OR email = $2 LIMIT 1",
      [username, email]
    );

    if (exists.rowCount)
      return res.status(409).json({ error: "Esse @usuário ou e-mail já está cadastrado." });

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = crypto.randomUUID();

    const result = await db.query(
      `INSERT INTO users (id, name, username, email, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, username, email, avatar, bio, plan, tag, followers_count, following_count, likes_count, posts_count, created_at`,
      [userId, name, username, email, passwordHash]
    );

    const user = result.rows[0];
    const token = signToken(user);

    res.status(201).json({ success: true, token, user: publicUser(user) });
  } catch (error) {
    console.error("ERRO /api/auth/register:", error);
    res.status(500).json({ error: "Não foi possível criar a conta." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: "Banco de dados não configurado no servidor." });
    if (!JWT_SECRET) return res.status(500).json({ error: "JWT_SECRET não configurada no servidor." });

    const identifier = typeof req.body.identifier === "string" ? req.body.identifier.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (!identifier || !password)
      return res.status(400).json({ error: "Informe seu @usuário/e-mail e sua senha." });

    const result = await db.query(
      "SELECT * FROM users WHERE username = $1 OR email = $1 LIMIT 1",
      [identifier.replace(/^@+/, "")]
    );

    if (!result.rowCount)
      return res.status(401).json({ error: "Usuário/e-mail ou senha incorretos." });

    const user = result.rows[0];
    const passwordOk = await bcrypt.compare(password, user.password_hash);

    if (!passwordOk)
      return res.status(401).json({ error: "Usuário/e-mail ou senha incorretos." });

    const token = signToken(user);
    res.json({ success: true, token, user: publicUser(user) });
  } catch (error) {
    console.error("ERRO /api/auth/login:", error);
    res.status(500).json({ error: "Não foi possível entrar na conta." });
  }
});

app.get("/api/auth/me", authRequired, async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: "Banco de dados não configurado no servidor." });

    const result = await db.query(
      `SELECT id, name, username, email, avatar, bio, plan, tag, followers_count, following_count, likes_count, posts_count, created_at
       FROM users WHERE id = $1 LIMIT 1`,
      [req.auth.sub]
    );

    if (!result.rowCount)
      return res.status(404).json({ error: "Conta não encontrada." });

    res.json({ success: true, user: publicUser(result.rows[0]) });
  } catch (error) {
    console.error("ERRO /api/auth/me:", error);
    res.status(500).json({ error: "Não foi possível carregar a conta." });
  }
});

/* =====================================================
   PERFIL PÚBLICO / ATUALIZAÇÃO DA CONTA
===================================================== */

app.get("/api/users/:id", async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: "Banco de dados não configurado no servidor." });
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Usuário não identificado." });
    const result = await db.query(
      `SELECT id, name, username, avatar, bio, plan, tag, followers_count, following_count, likes_count, posts_count
       FROM users WHERE id = $1 LIMIT 1`, [id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Usuário não encontrado." });
    res.json({ success: true, user: publicUser(result.rows[0]) });
  } catch (error) {
    console.error("ERRO /api/users/:id:", error);
    res.status(500).json({ error: "Não foi possível carregar o perfil." });
  }
});

app.patch("/api/auth/profile", authRequired, async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: "Banco de dados não configurado no servidor." });
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const avatar = typeof req.body.avatar === "string" ? req.body.avatar.trim() : "";
    if (name && (name.length < 2 || name.length > 80)) return res.status(400).json({ error: "O nome deve ter entre 2 e 80 caracteres." });
    if (avatar && !avatar.startsWith("data:image/")) return res.status(400).json({ error: "Foto de perfil inválida." });
    const current = await db.query(`SELECT id, name, avatar FROM users WHERE id = $1 LIMIT 1`, [req.auth.sub]);
    if (!current.rowCount) return res.status(404).json({ error: "Conta não encontrada." });
    const old = current.rows[0];
    const result = await db.query(
      `UPDATE users SET name = $1, avatar = $2 WHERE id = $3
       RETURNING id, name, username, email, avatar, bio, plan, tag, followers_count, following_count, likes_count, posts_count, created_at`,
      [name || old.name, avatar || old.avatar || "", req.auth.sub]
    );
    res.json({ success: true, user: publicUser(result.rows[0]) });
  } catch (error) {
    console.error("ERRO /api/auth/profile:", error);
    res.status(500).json({ error: "Não foi possível atualizar o perfil." });
  }
});

/* =====================================================
   CHAT
===================================================== */

app.post("/api/chat", async (req, res) => {
  try {
    const message =
      typeof req.body.message === "string"
        ? req.body.message.trim()
        : "";

    if (!message)
      return res.status(400).json({ error: "Digite uma mensagem." });

    if (!OPENAI_API_KEY)
      return res.status(500).json({
        error: "OPENAI_API_KEY não configurada no servidor."
      });

    const response = await openai.responses.create({
      model: "gpt-5.6-luna",
      instructions: `
Você é a NovaAI, assistente oficial da GeraçãoZ.
Responda em português do Brasil, salvo se o usuário pedir outro idioma.
Seja natural, útil, clara e objetiva.
Pedidos de geração ou edição de imagens são tratados pelas rotas específicas.
      `,
      input: message
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
      error: error?.message || "Erro ao conversar com a NovaAI."
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

    const requestedCount = Number.parseInt(req.body.count, 10);
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
      throw new Error("A API não retornou os dados das imagens.");

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
      error: error?.message || "Não foi possível gerar a imagem."
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
      typeof req.body.prompt === "string" && req.body.prompt.trim()
        ? req.body.prompt.trim()
        : "Edite esta imagem de forma criativa.";

    const file = new File(
      [req.file.buffer],
      req.file.originalname || "imagem.png",
      { type: req.file.mimetype || "image/png" }
    );

    const result = await openai.images.edit({
      model: "gpt-image-2",
      image: file,
      prompt,
      size: "1024x1024"
    });

    const imageData = result?.data?.[0]?.b64_json;

    if (!imageData)
      throw new Error("A API não retornou a imagem editada.");

    const image = "data:image/png;base64," + imageData;

    res.json({
      success: true,
      image,
      imageUrl: image,
      url: image
    });
  } catch (error) {
    console.error("ERRO /api/image/edit:", error);
    res.status(500).json({
      error: error?.message || "Não foi possível editar a imagem."
    });
  }
});

/* =====================================================
   POSTS / FEED / PERFIL
===================================================== */

app.get("/api/posts", async (req, res) => {
  try {
    const userId = String(req.query.userId || "");
    if (!db) return res.json({ success: true, posts });

    const postRows = await db.query(
      "SELECT post_id, COUNT(*)::int AS likes FROM post_likes GROUP BY post_id"
    );
    const userPostRows = userId
      ? await db.query("SELECT post_id FROM post_likes WHERE user_id = $1", [userId])
      : { rows: [] };
    const commentRows = await db.query(
      "SELECT comment_id, COUNT(*)::int AS likes FROM comment_likes GROUP BY comment_id"
    );
    const userCommentRows = userId
      ? await db.query("SELECT comment_id FROM comment_likes WHERE user_id = $1", [userId])
      : { rows: [] };

    const postCounts = new Map(postRows.rows.map(r => [String(r.post_id), Number(r.likes || 0)]));
    const userPosts = new Set(userPostRows.rows.map(r => String(r.post_id)));
    const commentCounts = new Map(commentRows.rows.map(r => [String(r.comment_id), Number(r.likes || 0)]));
    const userComments = new Set(userCommentRows.rows.map(r => String(r.comment_id)));

    const output = posts.map(post => ({
      ...post,
      likes: postCounts.get(String(post.id)) || 0,
      liked: userPosts.has(String(post.id)),
      comments: (post.comments || []).map(comment => ({
        ...comment,
        likes: commentCounts.get(String(comment.id)) || 0,
        liked: userComments.has(String(comment.id))
      }))
    }));

    res.json({ success: true, posts: output });
  } catch (error) {
    console.error("ERRO /api/posts:", error);
    res.status(500).json({ error: "Não foi possível carregar o feed." });
  }
});

app.post("/api/posts", (req, res) => {
  const image = req.body.image;
  const caption =
    typeof req.body.caption === "string" ? req.body.caption.trim() : "";

  if (!validImage(image))
    return res.status(400).json({
      error: "Nenhuma imagem válida foi enviada."
    });

  const post = createItem(
    image,
    caption,
    req.body.userId,
    req.body.userName,
    req.body.username,
    req.body.avatar
  );
  posts.unshift(post);

  res.status(201).json({
    success: true,
    post
  });
});

app.delete("/api/posts/:id", (req, res) => {
  const index = posts.findIndex(p => p.id === req.params.id);

  if (index < 0)
    return res.status(404).json({
      error: "Publicação não encontrada."
    });

  posts.splice(index, 1);
  res.json({ success: true });
});

app.post("/api/posts/:id/like", async (req, res) => {
  try {
    const post = find(posts, req.params.id);
    const userId = String(req.body.userId || "").trim();

    if (!post) return res.status(404).json({ error: "Publicação não encontrada." });
    if (!userId) return res.status(400).json({ error: "Usuário não identificado." });
    if (!db) return res.status(500).json({ error: "Banco de dados não configurado." });

    const existing = await db.query(
      "SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2",
      [req.params.id, userId]
    );

    let liked;
    if (existing.rowCount) {
      await db.query("DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2", [req.params.id, userId]);
      liked = false;
    } else {
      await db.query(
        "INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [req.params.id, userId]
      );
      liked = true;
    }

    const count = await db.query("SELECT COUNT(*)::int AS likes FROM post_likes WHERE post_id = $1", [req.params.id]);

    if (liked && post.userId && String(post.userId) !== userId) {
      const actor = await db.query("SELECT name FROM users WHERE id = $1 LIMIT 1", [userId]);
      const actorName = actor.rows[0]?.name || "Alguém";
      await createAccountNotification(
        post.userId, userId, "like",
        actorName + " curtiu sua publicação",
        "Toque para abrir a publicação.",
        req.params.id
      );
    }

    res.json({ success: true, liked, likes: Number(count.rows[0]?.likes || 0) });
  } catch (error) {
    console.error("ERRO /api/posts/:id/like:", error);
    res.status(500).json({ error: "Não foi possível alterar a curtida." });
  }
});

app.post("/api/posts/:postId/comments/:commentId/like", async (req, res) => {
  try {
    const post = find(posts, req.params.postId);
    const comment = post?.comments?.find(c => String(c.id) === String(req.params.commentId));
    const userId = String(req.body.userId || "").trim();

    if (!comment) return res.status(404).json({ error: "Comentário não encontrado." });
    if (!userId) return res.status(400).json({ error: "Usuário não identificado." });
    if (!db) return res.status(500).json({ error: "Banco de dados não configurado." });
        const existing = await db.query(
      "SELECT 1 FROM comment_likes WHERE comment_id = $1 AND user_id = $2",
      [req.params.commentId, userId]
    );

    let liked;
    if (existing.rowCount) {
      await db.query("DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2", [req.params.commentId, userId]);
      liked = false;
    } else {
      await db.query(
        "INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [req.params.commentId, userId]
      );
      liked = true;
    }

    const count = await db.query("SELECT COUNT(*)::int AS likes FROM comment_likes WHERE comment_id = $1", [req.params.commentId]);

    if (liked && comment.userId && String(comment.userId) !== userId) {
      const actor = await db.query("SELECT name FROM users WHERE id = $1 LIMIT 1", [userId]);
      const actorName = actor.rows[0]?.name || "Alguém";
      await createAccountNotification(
        comment.userId, userId, "like",
        actorName + " curtiu seu comentário",
        "Toque para abrir os comentários.",
        req.params.postId
      );
    }

    res.json({ success: true, liked, likes: Number(count.rows[0]?.likes || 0) });
  } catch (error) {
    console.error("ERRO /api/posts/:postId/comments/:commentId/like:", error);
    res.status(500).json({ error: "Não foi possível alterar a curtida do comentário." });
  }
});

app.post("/api/posts/:id/comments", async (req, res) => {
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
    userId: req.body.userId ? String(req.body.userId) : "",
    name: req.body.userName || "Você",
    userName: req.body.userName || "Você",
    username: req.body.username || "@voce",
    avatar: req.body.avatar || "",
    text,
    createdAt: timeNow()
  };

  post.comments.push(comment);

  if (post.userId && comment.userId && String(post.userId) !== String(comment.userId) && db) {
    await createAccountNotification(
      post.userId, comment.userId, "comment",
      (comment.userName || "Alguém") + " comentou na sua publicação",
      comment.text,
      post.id
    );
  }

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

  const status = createItem(
    image,
    caption,
    req.body.userId,
    req.body.userName,
    req.body.username,
    req.body.avatar
  );
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
    userId: req.body.userId ? String(req.body.userId) : "",
    name: req.body.userName || "Você",
    userName: req.body.userName || "Você",
    username: req.body.username || "@voce",
    avatar: req.body.avatar || "",
    text,
    createdAt: timeNow()
  };

  status.comments.push(comment);

  res.status(201).json({
    success: true,
    comment
  });
});

async function createAccountNotification(recipientId, actorId, type, title, text, targetId) {
  if (!db || !recipientId || !actorId || String(recipientId) === String(actorId)) return;
  await db.query(
    `INSERT INTO notifications (id, recipient_id, actor_id, type, title, text, target_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [crypto.randomUUID(), String(recipientId), String(actorId), type, title, text || "", targetId ? String(targetId) : ""]
  );
}

/* =====================================================
   MENSAGENS DIRETAS + NOTIFICAÇÕES
===================================================== */

app.get("/api/messages/conversations", authRequired, async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: "Banco de dados não configurado." });
    const result = await db.query(`
      SELECT DISTINCT ON (other_id)
        other_id AS "userId", other_name AS "name",
        other_username AS "username", other_avatar AS "avatar",
        text AS "lastMessage", created_at AS "createdAt"
      FROM (
        SELECT CASE WHEN dm.sender_id = $1 THEN dm.receiver_id ELSE dm.sender_id END AS other_id,
               u.name AS other_name, u.username AS other_username, COALESCE(u.avatar,'') AS other_avatar,
               dm.text, dm.created_at
        FROM direct_messages dm
        JOIN users u ON u.id = CASE WHEN dm.sender_id = $1 THEN dm.receiver_id ELSE dm.sender_id END
        WHERE dm.sender_id = $1 OR dm.receiver_id = $1
      ) x
      ORDER BY other_id, created_at DESC
    `, [req.auth.sub]);

    const conversations = result.rows
      .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
      .map(row=>({
        userId:String(row.userId),
        name:row.name,
        username:row.username?"@"+String(row.username).replace(/^@+/,''):"@usuario",
        avatar:row.avatar||"",
        lastMessage:row.lastMessage||"",
        createdAt:row.createdAt
      }));

    res.json({success:true,conversations});
  } catch(error) {
    console.error("ERRO /api/messages/conversations:",error);
    res.status(500).json({error:"Não foi possível carregar as conversas."});
  }
});

app.get("/api/messages/:userId", authRequired, async (req,res)=>{
  try{
    if(!db) return res.status(500).json({error:"Banco de dados não configurado."});

    const otherId=String(req.params.userId||"").trim();

    if(!otherId)
      return res.status(400).json({error:"Usuário não identificado."});

    const result=await db.query(`
      SELECT id,
             sender_id AS "from",
             receiver_id AS "to",
             text,
             created_at AS "createdAt"
      FROM direct_messages
      WHERE (sender_id=$1 AND receiver_id=$2)
         OR (sender_id=$2 AND receiver_id=$1)
      ORDER BY created_at ASC
    `,[req.auth.sub,otherId]);

    res.json({
      success:true,
      messages:result.rows.map(r=>({
        id:String(r.id),
        from:String(r.from),
        to:String(r.to),
        text:r.text,
        createdAt:r.createdAt
      }))
    });
  }catch(error){
    console.error("ERRO /api/messages/:userId:",error);
    res.status(500).json({error:"Não foi possível carregar as mensagens."});
  }
});

app.post("/api/messages", authRequired, async (req,res)=>{
  try{
    if(!db)
      return res.status(500).json({error:"Banco de dados não configurado."});

    const toUserId=String(req.body.toUserId||"").trim();
    const text=typeof req.body.text==="string"?req.body.text.trim():"";

    if(!toUserId)
      return res.status(400).json({error:"Destinatário não identificado."});

    if(toUserId===String(req.auth.sub))
      return res.status(400).json({error:"Você não pode enviar mensagem para si mesmo."});

    if(!text)
      return res.status(400).json({error:"Digite uma mensagem."});

    if(text.length>2000)
      return res.status(400).json({error:"A mensagem deve ter no máximo 2000 caracteres."});

    const receiver=await db.query(
      "SELECT id FROM users WHERE id=$1 LIMIT 1",
      [toUserId]
    );

    if(!receiver.rowCount)
      return res.status(404).json({error:"Usuário não encontrado."});

    const sender=await db.query(
      "SELECT name FROM users WHERE id=$1 LIMIT 1",
      [req.auth.sub]
    );

    const messageId=crypto.randomUUID();

    const result=await db.query(
      `INSERT INTO direct_messages(
         id,
         sender_id,
         receiver_id,
         text
       )
       VALUES($1,$2,$3,$4)
       RETURNING
         id,
         sender_id AS "from",
         receiver_id AS "to",
         text,
         created_at AS "createdAt"`,
      [messageId,req.auth.sub,toUserId,text]
    );

    const senderName=sender.rows[0]?.name||"Usuário";

    await db.query(
      `INSERT INTO notifications(
         id,
         recipient_id,
         actor_id,
         type,
         title,
         text,
         target_id
       )
       VALUES($1,$2,$3,'message',$4,$5,$6)`,
      [
        crypto.randomUUID(),
        toUserId,
        req.auth.sub,
        senderName+" enviou uma mensagem",
        text.length>80?text.slice(0,77)+"...":text,
        String(req.auth.sub)
      ]
    );

    const row=result.rows[0];

    res.status(201).json({
      success:true,
      message:{
        id:String(row.id),
        from:String(row.from),
        to:String(row.to),
        text:row.text,
        createdAt:row.createdAt
      }
    });
  }catch(error){
    console.error("ERRO /api/messages:",error);
    res.status(500).json({error:"Não foi possível enviar a mensagem."});
  }
});

app.get("/api/notifications", authRequired, async (req,res)=>{
  try{
    if(!db)
      return res.status(500).json({error:"Banco de dados não configurado."});

    const result=await db.query(`
      SELECT
        n.id,
        n.type,
        n.title,
        n.text,
        n.target_id AS "targetId",
        n.is_read AS "read",
        n.created_at AS "createdAt",
        n.actor_id AS "actorId",
        u.name AS "actorName",
        u.username AS "actorUsername",
        COALESCE(u.avatar,'') AS avatar
      FROM notifications n
      LEFT JOIN users u ON u.id=n.actor_id
      WHERE n.recipient_id=$1
      ORDER BY n.created_at DESC
      LIMIT 100
    `,[req.auth.sub]);

    res.json({
      success:true,
      notifications:result.rows.map(r=>({
        id:String(r.id),
        type:r.type,
        title:r.title,
        text:r.text||"",
        targetId:r.targetId||"",
        read:!!r.read,
        createdAt:r.createdAt,
        actorId:r.actorId?String(r.actorId):"",
        actorName:r.actorName||"Usuário",
        actorUsername:r.actorUsername?"@"+String(r.actorUsername).replace(/^@+/,''):"@usuario",
        avatar:r.avatar||""
      }))
    });
  }catch(error){
    console.error("ERRO /api/notifications:",error);
    res.status(500).json({error:"Não foi possível carregar as notificações."});
  }
});
app.post("/api/notifications/read", authRequired, async (req,res)=>{
  try{
    if(!db)
      return res.status(500).json({error:"Banco de dados não configurado."});

    const ids=Array.isArray(req.body.ids)
      ? req.body.ids.map(String).filter(Boolean).slice(0,100)
      : [];

    if(ids.length)
      await db.query(
        "UPDATE notifications SET is_read=TRUE WHERE recipient_id=$1 AND id=ANY($2::uuid[])",
        [req.auth.sub,ids]
      );
    else
      await db.query(
        "UPDATE notifications SET is_read=TRUE WHERE recipient_id=$1",
        [req.auth.sub]
      );

    res.json({success:true});
  }catch(error){
    console.error("ERRO /api/notifications/read:",error);
    res.status(500).json({
      error:"Não foi possível marcar as notificações."
    });
  }
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

async function startServer() {
  try {
    await initDatabase();
  } catch (error) {
    console.error("❌ ERRO AO INICIALIZAR O BANCO:", error);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log("=================================");
    console.log("🚀 NovaAI + GeraçãoZ online");
    console.log("Porta:", PORT);
    console.log("OpenAI:", OPENAI_API_KEY ? "CONFIGURADA" : "NÃO CONFIGURADA");
    console.log("Banco:", db ? "CONFIGURADO" : "NÃO CONFIGURADO");
    console.log("Contas: ATIVAS");
    console.log("Feed: ATIVO");
    console.log("Status: ATIVO");
    console.log("Curtidas: ATIVAS");
    console.log("Comentários: ATIVOS");
    console.log("Excluir: ATIVO");
    console.log("=================================");
  });
}

startServer();
