const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const multer = require("multer");
const crypto = require("crypto");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;


/* =====================================================
   E-MAIL
===================================================== */

const mailer =
  SMTP_HOST && SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS
        }
      })
    : null;


/* =====================================================
   BANCO DE DADOS
===================================================== */

const db = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes("localhost")
        ? false
        : { rejectUnauthorized: false }
    })
  : null;


if (!OPENAI_API_KEY) {
  console.warn("⚠️ OPENAI_API_KEY não configurada.");
}

if (!DATABASE_URL) {
  console.warn(
    "⚠️ DATABASE_URL não configurada. As contas não poderão ser usadas."
  );
}

if (!JWT_SECRET) {
  console.warn(
    "⚠️ JWT_SECRET não configurada. As sessões não poderão ser usadas."
  );
}

if (!mailer) {
  console.warn(
    "⚠️ SMTP não configurado. Confirmação de e-mail não poderá ser enviada."
  );
}


/* =====================================================
   INICIALIZAÇÃO DO BANCO
===================================================== */

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


    /* =================================================
       NOVOS CAMPOS DE CONTA
    ================================================= */

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_verified
      BOOLEAN NOT NULL DEFAULT TRUE;

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS private_profile
      BOOLEAN NOT NULL DEFAULT FALSE;


    /* =================================================
       CÓDIGOS DE E-MAIL
    ================================================= */

    CREATE TABLE IF NOT EXISTS email_verification_codes (
      id UUID PRIMARY KEY,

      user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      purpose VARCHAR(30) NOT NULL,

      code_hash TEXT NOT NULL,

      expires_at TIMESTAMPTZ NOT NULL,

      attempts INTEGER NOT NULL DEFAULT 0,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );


    CREATE INDEX IF NOT EXISTS
      email_verification_user_idx

      ON email_verification_codes(
        user_id,
        purpose,
        created_at DESC
      );


    /* =================================================
       SEGUIDORES
    ================================================= */

    CREATE TABLE IF NOT EXISTS follows (

      follower_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      following_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      PRIMARY KEY (
        follower_id,
        following_id
      ),

      CHECK (
        follower_id <> following_id
      )
    );


    CREATE INDEX IF NOT EXISTS
      follows_following_idx

      ON follows(
        following_id,
        created_at DESC
      );


    /* =================================================
       MENSAGENS
    ================================================= */

    CREATE TABLE IF NOT EXISTS direct_messages (

      id UUID PRIMARY KEY,

      sender_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      receiver_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      text TEXT NOT NULL,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );


    CREATE INDEX IF NOT EXISTS
      direct_messages_pair_idx

      ON direct_messages(
        sender_id,
        receiver_id,
        created_at
      );


    /* =================================================
       NOTIFICAÇÕES
    ================================================= */

    CREATE TABLE IF NOT EXISTS notifications (

      id UUID PRIMARY KEY,

      recipient_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      actor_id UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

      type VARCHAR(30) NOT NULL,

      title TEXT NOT NULL,

      text TEXT DEFAULT '',

      target_id TEXT DEFAULT '',

      is_read BOOLEAN NOT NULL DEFAULT FALSE,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );


    CREATE INDEX IF NOT EXISTS
      notifications_recipient_idx

      ON notifications(
        recipient_id,
        created_at DESC
      );

  `);

  console.log("✅ Banco de dados de contas pronto.");
}


/* =====================================================
   FUNÇÕES DE USUÁRIO
===================================================== */

function normalizeUsername(value) {

  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");

}


function validEmail(value) {

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value || "").trim()
  );

}


/* =====================================================
   USUÁRIO PÚBLICO
===================================================== */

function publicUser(user) {

  return {

    id: user.id,

    name: user.name,

    username: user.username,

    email: user.email,

    emailVerified:
      user.email_verified !== false,

    privateProfile:
      !!user.private_profile,

    avatar:
      user.avatar || "",

    bio:
      user.bio || "",

    plan:
      user.plan,

    tag:
      user.tag || "",

    followers:
      user.followers_count,

    following:
      user.following_count,

    likes:
      user.likes_count,

    publications:
      user.posts_count,

    createdAt:
      user.created_at

  };

}


/* =====================================================
   AUTENTICAÇÃO OPCIONAL
===================================================== */

function optionalAuth(req, res, next) {

  try {

    const header =
      req.headers.authorization || "";

    const token =
      header.startsWith("Bearer ")
        ? header.slice(7).trim()
        : "";

    if (!token || !JWT_SECRET) {

      req.auth = null;

      return next();
    }


    req.auth =
      jwt.verify(
        token,
        JWT_SECRET
      );

    next();

  } catch (error) {

    req.auth = null;

    next();

  }

}


/* =====================================================
   AUTENTICAÇÃO OBRIGATÓRIA
===================================================== */

function authRequired(req, res, next) {

  try {

    if (!JWT_SECRET) {

      return res.status(500).json({
        error:
          "JWT_SECRET não configurada no servidor."
      });

    }


    const header =
      req.headers.authorization || "";

    const token =
      header.startsWith("Bearer ")
        ? header.slice(7).trim()
        : "";


    if (!token) {

      return res.status(401).json({
        error:
          "Faça login para continuar."
      });

    }


    req.auth =
      jwt.verify(
        token,
        JWT_SECRET
      );

    next();

  } catch (error) {

    return res.status(401).json({
      error:
        "Sessão inválida ou expirada."
    });

  }

}


/* =====================================================
   TOKEN
===================================================== */

function signToken(user) {

  if (!JWT_SECRET) {

    throw new Error(
      "JWT_SECRET não configurada no servidor."
    );

  }


  return jwt.sign(

    {
      sub: user.id,

      username:
        user.username
    },

    JWT_SECRET,

    {
      expiresIn: "30d"
    }

  );

}


/* =====================================================
   CÓDIGO DE CONFIRMAÇÃO
===================================================== */

function makeVerificationCode() {

  return String(
    crypto.randomInt(
      0,
      1000000
    )
  ).padStart(
    6,
    "0"
  );

}


/* =====================================================
   CRIAR CÓDIGO DE E-MAIL
===================================================== */

async function createEmailCode(
  userId,
  purpose = "verify_email"
) {

  if (!db) {

    throw new Error(
      "Banco de dados não configurado."
    );

  }


  if (!mailer) {

    throw new Error(
      "SMTP não configurado no servidor."
    );

  }


  const code =
    makeVerificationCode();


  const codeHash =
    await bcrypt.hash(
      code,
      10
    );


  await db.query(

    `DELETE FROM email_verification_codes
     WHERE user_id = $1
     AND purpose = $2`,

    [
      userId,
      purpose
    ]

  );


  await db.query(

    `INSERT INTO email_verification_codes
      (
        id,
        user_id,
        purpose,
        code_hash,
        expires_at
      )

     VALUES
      (
        $1,
        $2,
        $3,
        $4,
        NOW() + INTERVAL '15 minutes'
      )`,

    [
      crypto.randomUUID(),

      userId,

      purpose,

      codeHash
    ]

  );


  return code;

}


/* =====================================================
   ENVIAR E-MAIL
===================================================== */

async function sendVerificationEmail(
  email,
  name,
  code,
  purpose = "verify_email"
) {

  if (!mailer) {

    throw new Error(
      "SMTP não configurado no servidor."
    );

  }


  const isReset =
    purpose === "reset_password";


  const subject =
    isReset

      ? "GeraçãoZ — código para redefinir sua senha"

      : "GeraçãoZ — confirme seu e-mail";


  const title =
    isReset

      ? "Redefinição de senha"

      : "Confirme seu e-mail";


  await mailer.sendMail({

    from:
      SMTP_FROM,

    to:
      email,

    subject,

    text:

`Olá, ${name || "usuário"}!

Seu código GeraçãoZ é: ${code}

Este código expira em 15 minutos.

Se você não solicitou isso,
ignore este e-mail.`,

    html:

`<!doctype html>

<html lang="pt-BR">

<head>

<meta charset="UTF-8">

</head>

<body
style="
font-family:Arial,sans-serif;
background:#f5f5f5;
padding:24px;
">

<div
style="
max-width:520px;
margin:auto;
background:#fff;
border-radius:18px;
padding:28px;
">

<h2>
${title}
</h2>

<p>
Olá, ${name || "usuário"}!
</p>

<p>
Seu código é:
</p>

<div
style="
font-size:32px;
font-weight:700;
letter-spacing:8px;
text-align:center;
padding:18px;
background:#f1edff;
border-radius:12px;
">

${code}

</div>

<p>
O código expira em
<b>15 minutos</b>.
</p>

<p
style="
color:#666;
font-size:13px;
">

Se você não solicitou isso,
ignore este e-mail.

</p>

</div>

</body>

</html>`

  });

}


/* =====================================================
   ESTADO DOS SEGUIDORES
===================================================== */

async function getFollowState(
  viewerId,
  targetId
) {

  if (!db || !viewerId || !targetId) {

    return {

      isFollowing: false,

      followsYou: false,

      mutualFollow: false

    };

  }


  const result =
    await db.query(

      `SELECT

        EXISTS(
          SELECT 1
          FROM follows
          WHERE follower_id = $1
          AND following_id = $2
        ) AS "isFollowing",

        EXISTS(
          SELECT 1
          FROM follows
          WHERE follower_id = $2
          AND following_id = $1
        ) AS "followsYou"`,

      [
        viewerId,
        targetId
      ]

    );


  const row =
    result.rows[0] || {};


  return {

    isFollowing:
      !!row.isFollowing,

    followsYou:
      !!row.followsYou,

    mutualFollow:
      !!row.isFollowing &&
      !!row.followsYou

  };

}


/* =====================================================
   PERMISSÃO DE PERFIL
===================================================== */

async function getProfileAccess(
  viewerId,
  targetUser
) {

  const isOwner =
    viewerId &&
    String(viewerId) ===
    String(targetUser.id);


  if (isOwner) {

    return {

      isOwner: true,

      canView: true,

      ...await getFollowState(
        viewerId,
        targetUser.id
      )

    };

  }


  if (!targetUser.private_profile) {

    return {

      isOwner: false,

      canView: true,

      ...await getFollowState(
        viewerId,
        targetUser.id
      )

    };

  }


  if (!viewerId) {

    return {

      isOwner: false,

      canView: false,

      isFollowing: false,

      followsYou: false,

      mutualFollow: false

    };

  }


  const followState =
    await getFollowState(
      viewerId,
      targetUser.id
    );


  return {

    isOwner: false,

    canView:
      followState.mutualFollow,

    ...followState

  };

}


/* =====================================================
   UPLOAD DE IMAGEM
===================================================== */

const upload = multer({

  storage:
    multer.memoryStorage(),

  limits: {

    fileSize:
      10 * 1024 * 1024

  },

  fileFilter:
    (req, file, cb) => {

      if (
        file.mimetype &&
        file.mimetype.startsWith(
          "image/"
        )
      ) {

        cb(null, true);

      } else {

        cb(
          new Error(
            "Envie somente uma imagem."
          )
        );

      }

    }

});


/* =====================================================
   OPENAI
===================================================== */

const openai =
  new OpenAI({
    apiKey:
      OPENAI_API_KEY
  });


/* =====================================================
   CORS
===================================================== */

const corsOptions = {

  origin:
    function (
      origin,
      callback
    ) {

      if (
        !origin ||
        origin === "null"
      ) {

        return callback(
          null,
          true
        );

      }


      return callback(
        null,
        true
      );

    },

  methods: [
    "GET",
    "POST",
    "PATCH",
    "DELETE",
    "OPTIONS"
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization"
  ],

  credentials: false,

  optionsSuccessStatus: 204

};


app.use(
  cors(corsOptions)
);

app.options(
  "*",
  cors(corsOptions)
);

app.use(
  express.json({
    limit: "12mb"
  })
);


/* =====================================================
   DADOS SOCIAIS TEMPORÁRIOS
===================================================== */

const posts = [];

const statuses = [];


function id() {

  return crypto.randomUUID();

}


function timeNow() {

  return new Date()
    .toLocaleTimeString(
      "pt-BR",
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    );

}


function createItem(
  image,
  caption,
  userId,
  userName,
  username,
  avatar
) {

  return {

    id:
      id(),

    image,

    caption:
      caption || "",

    userId:
      userId
        ? String(userId)
        : "",

    userName:
      userName || "",

    username:
      username || "",

    avatar:
      avatar || "",

    likes:
      0,

    liked:
      false,

    comments:
      [],

    createdAt:
      timeNow()

  };

}


function find(
  list,
  itemId
) {

  return list.find(
    item =>
      item.id === itemId
  );

}


function validImage(
  image
) {

  return (
    typeof image === "string" &&
    image.startsWith(
      "data:image/"
    )
  );

}


/* =====================================================
   STATUS DO SERVIDOR
===================================================== */

app.get(
  "/",
  (req, res) => {

    res.json({

      status:
        "online",

      app:
        "NovaAI + GeraçãoZ",

      openai:
        !!OPENAI_API_KEY,

      database:
        !!db,

      smtp:
        !!mailer,

      social:
        true

    });

  }
);


app.get(
  "/api/health",
  (req, res) => {

    res.json({

      ok:
        true,

      openai:
        !!OPENAI_API_KEY,

      database:
        !!db,

      smtp:
        !!mailer,

      social:
        true

    });

  }
);


/* =====================================================
   CRIAR CONTA
===================================================== */

app.post(
  "/api/auth/register",
  async (req, res) => {

    try {

      if (!db) {

        return res.status(500).json({

          error:
            "Banco de dados não configurado no servidor."

        });

      }


      if (!JWT_SECRET) {

        return res.status(500).json({

          error:
            "JWT_SECRET não configurada no servidor."

        });

      }


      const name =
        typeof req.body.name === "string"

          ? req.body.name.trim()

          : "";


      const username =
        normalizeUsername(
          req.body.username
        );


      const email =
        typeof req.body.email === "string"

          ? req.body.email
              .trim()
              .toLowerCase()

          : "";


      const password =
        typeof req.body.password === "string"

          ? req.body.password

          : "";


      if (
        name.length < 2 ||
        name.length > 80
      ) {

        return res.status(400).json({

          error:
            "O nome deve ter entre 2 e 80 caracteres."

        });

      }


      if (
        !/^[a-z0-9._]{3,30}$/
          .test(username)
      ) {

        return res.status(400).json({

          error:
            "O @usuário deve ter 3 a 30 caracteres e usar apenas letras, números, ponto ou _."

        });

      }


      if (!validEmail(email)) {

        return res.status(400).json({

          error:
            "Digite um e-mail válido."

        });

      }


      if (
        password.length < 8 ||
        password.length > 72
      ) {

        return res.status(400).json({

          error:
            "A senha deve ter entre 8 e 72 caracteres."

        });

      }


      const exists =
        await db.query(

          `SELECT id
           FROM users
           WHERE username = $1
           OR email = $2
           LIMIT 1`,

          [
            username,
            email
          ]

        );


      if (exists.rowCount) {

        return res.status(409).json({

          error:
            "Esse @usuário ou e-mail já está cadastrado."

        });

      }


      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );


      const userId =
        crypto.randomUUID();


      /*
       * Novas contas começam
       * não verificadas.
       */

    
const result =
        await db.query(

          `INSERT INTO users
            (
              id,
              name,
              username,
              email,
              password_hash,
              email_verified
            )

           VALUES
            (
              $1,
              $2,
              $3,
              $4,
              $5,
              FALSE
            )

           RETURNING
             id,
             name,
             username,
             email,
             avatar,
             bio,
             plan,
             tag,
             followers_count,
             following_count,
             likes_count,
             posts_count,
             email_verified,
             private_profile,
             created_at`,

          [
            userId,
            name,
            username,
            email,
            passwordHash
          ]

        );


      const user =
        result.rows[0];


      /*
       * Gera o código.
       */

      const code =
        await createEmailCode(
          userId,
          "verify_email"
        );


      /*
       * Envia o código.
       */

      await sendVerificationEmail(
        email,
        name,
        code,
        "verify_email"
      );


      res.status(201).json({

        success:
          true,

        needsEmailVerification:
          true,

        message:
          "Conta criada. Enviamos um código de confirmação para seu e-mail.",

        user: publicUser(user)

      });

    } catch (error) {

      console.error(
        "ERRO /api/auth/register:",
        error
      );


      res.status(500).json({

        error:
          error?.message ||
          "Não foi possível criar a conta."

      });

    }

  }
);


/* =====================================================
   CONFIRMAR E-MAIL
===================================================== */

app.post(
  "/api/auth/verify-email",
  async (req, res) => {

    try {

      if (!db) {

        return res.status(500).json({

          error:
            "Banco de dados não configurado."

        });

      }


      const email =
        typeof req.body.email === "string"

          ? req.body.email
              .trim()
              .toLowerCase()

          : "";


      const code =
        String(
          req.body.code || ""
        )
        .trim();


      if (!validEmail(email)) {

        return res.status(400).json({

          error:
            "E-mail inválido."

        });

      }


      if (
        !/^\d{6}$/.test(code)
      ) {

        return res.status(400).json({

          error:
            "Digite o código de 6 dígitos."

        });

      }


      const userResult =
        await db.query(

          `SELECT *
           FROM users
           WHERE email = $1
           LIMIT 1`,

          [email]

        );


      if (!userResult.rowCount) {

        return res.status(404).json({

          error:
            "Conta não encontrada."

        });

      }


      const user =
        userResult.rows[0];


      if (user.email_verified) {

        return res.json({

          success:
            true,

          message:
            "O e-mail já está confirmado."

        });

      }


      const codeResult =
        await db.query(

          `SELECT *
           FROM email_verification_codes

           WHERE user_id = $1

           AND purpose = 'verify_email'

           ORDER BY created_at DESC

           LIMIT 1`,

          [user.id]

        );


      if (!codeResult.rowCount) {

        return res.status(400).json({

          error:
            "Código não encontrado. Solicite um novo código."

        });

      }


      const savedCode =
        codeResult.rows[0];


      if (
        new Date(
          savedCode.expires_at
        ) < new Date()
      ) {

        return res.status(400).json({

          error:
            "Esse código expirou. Solicite um novo código."

        });

      }


      if (
        savedCode.attempts >= 5
      ) {

        return res.status(429).json({

          error:
            "Número máximo de tentativas atingido. Solicite um novo código."

        });

      }


      const correct =
        await bcrypt.compare(
          code,
          savedCode.code_hash
        );


      if (!correct) {

        await db.query(

          `UPDATE
             email_verification_codes

           SET attempts =
             attempts + 1

           WHERE id = $1`,

          [savedCode.id]

        );


        return res.status(400).json({

          error:
            "Código incorreto."

        });

      }


      await db.query(

        `UPDATE users

         SET email_verified = TRUE

         WHERE id = $1`,

        [user.id]

      );


      await db.query(

        `DELETE FROM
           email_verification_codes

         WHERE user_id = $1

         AND purpose = 'verify_email'`,

        [user.id]

      );


      const updated =
        await db.query(

          `SELECT
             id,
             name,
             username,
             email,
             avatar,
             bio,
             plan,
             tag,
             followers_count,
             following_count,
             likes_count,
             posts_count,
             email_verified,
             private_profile,
             created_at

           FROM users

           WHERE id = $1`,

          [user.id]

        );


      const updatedUser =
        updated.rows[0];


      const token =
        signToken(
          updatedUser
        );


      res.json({

        success:
          true,

        message:
          "E-mail confirmado com sucesso.",

        token,

        user:
          publicUser(
            updatedUser
          )

      });

    } catch (error) {

      console.error(
        "ERRO /api/auth/verify-email:",
        error
      );


      res.status(500).json({

        error:
          "Não foi possível confirmar o e-mail."

      });

    }

  }
);


/* =====================================================
   REENVIAR CÓDIGO
===================================================== */

app.post(
  "/api/auth/resend-code",
  async (req, res) => {

    try {

      if (!db) {

        return res.status(500).json({

          error:
            "Banco de dados não configurado."

        });

      }


      const email =
        typeof req.body.email === "string"

          ? req.body.email
              .trim()
              .toLowerCase()

          : "";


      if (!validEmail(email)) {

        return res.status(400).json({

          error:
            "Digite um e-mail válido."

        });

      }


      const result =
        await db.query(

          `SELECT
             id,
             name,
             email,
             email_verified

           FROM users

           WHERE email = $1

           LIMIT 1`,

          [email]

        );


      if (!result.rowCount) {

        return res.status(404).json({

          error:
            "Conta não encontrada."

        });

      }


      const user =
        result.rows[0];


      if (user.email_verified) {

        return res.json({

          success:
            true,

          message:
            "Esse e-mail já está confirmado."

        });

      }


      const code =
        await createEmailCode(
          user.id,
          "verify_email"
        );


      await sendVerificationEmail(
        user.email,
        user.name,
        code,
        "verify_email"
      );


      res.json({

        success:
          true,

        message:
          "Um novo código foi enviado para seu e-mail."

      });

    } catch (error) {

      console.error(
        "ERRO /api/auth/resend-code:",
        error
      );


      res.status(500).json({

        error:
          "Não foi possível reenviar o código."

      });

    }

  }
);
/* =====================================================
   LOGIN
===================================================== */

app.post(
  "/api/auth/login",
  async (req, res) => {

    try {

      if (!db) {
        return res.status(500).json({
          error:
            "Banco de dados não configurado no servidor."
        });
      }

      if (!JWT_SECRET) {
        return res.status(500).json({
          error:
            "JWT_SECRET não configurada no servidor."
        });
      }

      const login =
        typeof req.body.login === "string"
          ? req.body.login.trim().toLowerCase()
          : "";

      const password =
        typeof req.body.password === "string"
          ? req.body.password
          : "";

      if (!login || !password) {
        return res.status(400).json({
          error:
            "Informe seu usuário/e-mail e sua senha."
        });
      }

      const result =
        await db.query(

          `SELECT *
           FROM users
           WHERE username = $1
              OR email = $1
           LIMIT 1`,

          [login]

        );

      if (!result.rowCount) {
        return res.status(401).json({
          error:
            "Usuário/e-mail ou senha incorretos."
        });
      }

      const user =
        result.rows[0];

      const passwordOk =
        await bcrypt.compare(
          password,
          user.password_hash
        );

      if (!passwordOk) {
        return res.status(401).json({
          error:
            "Usuário/e-mail ou senha incorretos."
        });
      }

      /*
       * Conta antiga pode continuar funcionando.
       * Conta nova precisa confirmar o e-mail.
       */

      if (
        user.email_verified === false
      ) {

        return res.status(403).json({

          needsEmailVerification:
            true,

          email:
            user.email,

          error:
            "Confirme seu e-mail antes de entrar."
        });

      }

      const token =
        signToken(user);

      res.json({

        success:
          true,

        token,

        user:
          publicUser(user)

      });

    } catch (error) {

      console.error(
        "ERRO /api/auth/login:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível fazer login."
      });

    }

  }
);


/* =====================================================
   USUÁRIO LOGADO
===================================================== */

app.get(
  "/api/auth/me",
  authRequired,
  async (req, res) => {

    try {

      if (!db) {
        return res.status(500).json({
          error:
            "Banco de dados não configurado."
        });
      }

      const result =
        await db.query(

          `SELECT
             id,
             name,
             username,
             email,
             avatar,
             bio,
             plan,
             tag,
             followers_count,
             following_count,
             likes_count,
             posts_count,
             email_verified,
             private_profile,
             created_at

           FROM users

           WHERE id = $1

           LIMIT 1`,

          [req.auth.sub]

        );

      if (!result.rowCount) {
        return res.status(404).json({
          error:
            "Usuário não encontrado."
        });
      }

      res.json({
        user:
          publicUser(
            result.rows[0]
          )
      });

    } catch (error) {

      console.error(
        "ERRO /api/auth/me:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar sua conta."
      });

    }

  }
);


/* =====================================================
   ATUALIZAR PERFIL
===================================================== */

app.patch(
  "/api/auth/profile",
  authRequired,
  async (req, res) => {

    try {

      if (!db) {
        return res.status(500).json({
          error:
            "Banco de dados não configurado."
        });
      }

      const name =
        typeof req.body.name === "string"
          ? req.body.name.trim()
          : null;

      const bio =
        typeof req.body.bio === "string"
          ? req.body.bio.trim()
          : null;

      const avatar =
        typeof req.body.avatar === "string"
          ? req.body.avatar.trim()
          : null;

      const updates = [];
      const values = [];

      if (
        name !== null &&
        name.length >= 2 &&
        name.length <= 80
      ) {

        values.push(name);

        updates.push(
          `name = $${values.length}`
        );

      }

      if (bio !== null) {

        if (bio.length > 500) {

          return res.status(400).json({
            error:
              "A biografia pode ter no máximo 500 caracteres."
          });

        }

        values.push(bio);

        updates.push(
          `bio = $${values.length}`
        );

      }

      if (avatar !== null) {

        if (
          avatar &&
          !validImage(avatar)
        ) {

          return res.status(400).json({
            error:
              "A foto de perfil precisa ser uma imagem válida."
          });

        }

        values.push(avatar);

        updates.push(
          `avatar = $${values.length}`
        );

      }

      if (!updates.length) {

        return res.status(400).json({
          error:
            "Nenhuma alteração foi enviada."
        });

      }

      values.push(
        req.auth.sub
      );

      const result =
        await db.query(

          `UPDATE users

           SET ${updates.join(", ")}

           WHERE id = $${values.length}

           RETURNING *`,

          values

        );

      res.json({

        success:
          true,

        user:
          publicUser(
            result.rows[0]
          )

      });

    } catch (error) {

      console.error(
        "ERRO /api/auth/profile:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível atualizar o perfil."
      });

    }

  }
);


/* =====================================================
   ALTERAR PRIVACIDADE DO PERFIL
===================================================== */

app.patch(
  "/api/auth/privacy",
  authRequired,
  async (req, res) => {

    try {

      if (!db) {
        return res.status(500).json({
          error:
            "Banco de dados não configurado."
        });
      }

      const privateProfile =
        req.body.privateProfile === true ||
        req.body.privateProfile === "true";

      const result =
        await db.query(

          `UPDATE users

           SET private_profile = $1

           WHERE id = $2

           RETURNING *`,

          [
            privateProfile,
            req.auth.sub
          ]

        );

      if (!result.rowCount) {
        return res.status(404).json({
          error:
            "Usuário não encontrado."
        });
      }

      res.json({

        success:
          true,

        privateProfile:
          !!result.rows[0].private_profile,

        user:
          publicUser(
            result.rows[0]
          )

      });

    } catch (error) {

      console.error(
        "ERRO /api/auth/privacy:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível alterar a privacidade."
      });

    }

  }
);


/* =====================================================
   VER PERFIL DE OUTRO USUÁRIO
===================================================== */

app.get(
  "/api/users/:id",
  optionalAuth,
  async (req, res) => {

    try {

      if (!db) {
        return res.status(500).json({
          error:
            "Banco de dados não configurado."
        });
      }

      const result =
        await db.query(

          `SELECT
             id,
             name,
             username,
             email,
             avatar,
             bio,
             plan,
             tag,
             followers_count,
             following_count,
             likes_count,
             posts_count,
             email_verified,
             private_profile,
             created_at

           FROM users

           WHERE id = $1

           LIMIT 1`,

          [req.params.id]

        );

      if (!result.rowCount) {
        return res.status(404).json({
          error:
            "Usuário não encontrado."
        });
      }

      const user =
        result.rows[0];

      const access =
        await getProfileAccess(
          req.auth?.sub || null,
          user
        );

      /*
       * Perfil privado:
       * mostramos informações básicas,
       * mas não liberamos conteúdo privado
       * quando não existe seguimento mútuo.
       */

      res.json({

        user:
          publicUser(user),

        access: {

          isOwner:
            access.isOwner,

          isFollowing:
            access.isFollowing,

          followsYou:
            access.followsYou,

          mutualFollow:
            access.mutualFollow,

          canView:
            access.canView

        },

        privateProfile:
          !!user.private_profile,

        restricted:
          !access.canView

      });

    } catch (error) {

      console.error(
        "ERRO /api/users/:id:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar o perfil."
      });

    }

  }
);


/* =====================================================
   SEGUIR USUÁRIO
===================================================== */

app.post(
  "/api/users/:id/follow",
  authRequired,
  async (req, res) => {

    try {

      if (!db) {
        return res.status(500).json({
          error:
            "Banco de dados não configurado."
        });
      }

      const targetId =
        req.params.id;

      const viewerId =
        req.auth.sub;

      if (
        String(targetId) ===
        String(viewerId)
      ) {

        return res.status(400).json({
          error:
            "Você não pode seguir a si mesmo."
        });

      }

      const target =
        await db.query(

          `SELECT
             id,
             name,
             username,
             private_profile

           FROM users

           WHERE id = $1

           LIMIT 1`,

          [targetId]

        );

      if (!target.rowCount) {

        return res.status(404).json({
          error:
            "Usuário não encontrado."
        });

      }

      const existing =
        await db.query(

          `SELECT 1
           FROM follows
           WHERE follower_id = $1
           AND following_id = $2
           LIMIT 1`,

          [
            viewerId,
            targetId
          ]

        );

      if (existing.rowCount) {

        return res.json({

          success:
            true,

          following:
            true,

          message:
            "Você já segue esse usuário."

        });

      }

      await db.query(
        "BEGIN"
      );

      try {

        await db.query(

          `INSERT INTO follows
             (
               follower_id,
               following_id
             )

           VALUES
             ($1, $2)`,

          [
            viewerId,
            targetId
          ]

        );

        await db.query(

          `UPDATE users

           SET followers_count =
             followers_count + 1

           WHERE id = $1`,

          [targetId]

        );

        await db.query(

          `UPDATE users

           SET following_count =
             following_count + 1

           WHERE id = $1`,

          [viewerId]

        );

        await db.query(
          "COMMIT"
        );

      } catch (transactionError) {

        await db.query(
          "ROLLBACK"
        );

        throw transactionError;

      }


      /*
       * Notificação para o usuário seguido.
       */

      await db.query(

        `INSERT INTO notifications
          (
            id,
            recipient_id,
            actor_id,
            type,
            title,
            text,
            target_id
          )

         VALUES
          (
            $1,
            $2,
            $3,
            'follow',
            'Novo seguidor',
            'Alguém começou a seguir você.',
            $4
          )`,

        [
          id(),
          targetId,
          viewerId,
          viewerId
        ]

      );


      const state =
        await getFollowState(
          viewerId,
          targetId
        );


      res.json({

        success:
          true,

        following:
          state.isFollowing,

        followsYou:
          state.followsYou,

        mutualFollow:
          state.mutualFollow

      });

    } catch (error) {

      console.error(
        "ERRO /api/users/:id/follow:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível seguir esse usuário."
      });

    }

  }
);


/* =====================================================
   DEIXAR DE SEGUIR
===================================================== */

app.delete(
  "/api/users/:id/follow",
  authRequired,
  async (req, res) => {

    try {

      if (!db) {
        return res.status(500).json({
          error:
            "Banco de dados não configurado."
        });
      }

      const targetId =
        req.params.id;

      const viewerId =
        req.auth.sub;

      const existing =
        await db.query(

          `SELECT 1
           FROM follows
           WHERE follower_id = $1
           AND following_id = $2
           LIMIT 1`,

          [
            viewerId,
            targetId
          ]

        );

      if (!existing.rowCount) {

        return res.json({

          success:
            true,

          following:
            false,

          message:
            "Você não segue esse usuário."

        });

      }


      await db.query(
        "BEGIN"
      );

      try {

        await db.query(

          `DELETE FROM follows

           WHERE follower_id = $1

           AND following_id = $2`,

          [
            viewerId,
            targetId
          ]

        );


        await db.query(

          `UPDATE users

           SET followers_count =
             GREATEST(
               followers_count - 1,
               0
             )

           WHERE id = $1`,

          [targetId]

        );


        await db.query(

          `UPDATE users

           SET following_count =
             GREATEST(
               following_count - 1,
               0
             )

           WHERE id = $1`,

          [viewerId]

        );


        await db.query(
          "COMMIT"
        );

      } catch (transactionError) {

        await db.query(
          "ROLLBACK"
        );

        throw transactionError;

      }


      const state =
        await getFollowState(
          viewerId,
          targetId
        );


      res.json({

        success:
          true,

        following:
          state.isFollowing,

        followsYou:
          state.followsYou,

        mutualFollow:
          state.mutualFollow

      });

    } catch (error) {

      console.error(
        "ERRO DELETE /follow:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível deixar de seguir."
      });

    }

  }
);


/* =====================================================
   LISTAR SEGUIDORES
===================================================== */

app.get(
  "/api/users/:id/followers",
  optionalAuth,
  async (req, res) => {

    try {

      if (!db) {
        return res.status(500).json({
          error:
            "Banco de dados não configurado."
        });
      }

      const targetId =
        req.params.id;


      const target =
        await db.query(

          `SELECT
             id,
             private_profile
           FROM users
           WHERE id = $1
           LIMIT 1`,

          [targetId]

        );


      if (!target.rowCount) {

        return res.status(404).json({
          error:
            "Usuário não encontrado."
        });

      }


      const access =
        await getProfileAccess(
          req.auth?.sub || null,
          target.rows[0]
        );


      /*
       * Perfil privado sem permissão:
       * não mostramos a lista completa.
       */

      if (
        !access.canView &&
        !access.isOwner
      ) {

        return res.json({

          restricted:
            true,

          followers:
            [],

          count:
            target.rows[0]
              .followers_count || 0

        });

      }


      const result =
        await db.query(

          `SELECT
             u.id,
             u.name,
             u.username,
             u.avatar,
             u.bio,
             u.plan,
             u.tag,
             u.private_profile

           FROM follows f

           JOIN users u
             ON u.id = f.follower_id

           WHERE f.following_id = $1

           ORDER BY f.created_at DESC`,

          [targetId]

        );


      const followers =
        result.rows.map(
          user => ({
            ...publicUser(user),

            ...(
              req.auth?.sub
                ? {
                    followState:
                      null
                  }
                : {}
            )

          })
        );


      res.json({

        restricted:
          false,

        followers

      });

    } catch (error) {

      console.error(
        "ERRO /followers:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar os seguidores."
      });

    }

  }
);


/* =====================================================
   LISTAR QUEM O USUÁRIO SEGUE
===================================================== */

app.get(
  "/api/users/:id/following",
  optionalAuth,
  async (req, res) => {

    try {

      if (!db) {
        return res.status(500).json({
          error:
            "Banco de dados não configurado."
        });
      }

      const targetId =
        req.params.id;


      const target =
        await db.query(

          `SELECT
             id,
             private_profile
           FROM users
           WHERE id = $1
           LIMIT 1`,

          [targetId]

        );


      if (!target.rowCount) {

        return res.status(404).json({
          error:
            "Usuário não encontrado."
        });

      }


      const access =
        await getProfileAccess(
          req.auth?.sub || null,
          target.rows[0]
        );


      if (
        !access.canView &&
        !access.isOwner
      ) {

        return res.json({

          restricted:
            true,

          following:
            []

        });

      }


      const result =
        await db.query(

          `SELECT
             u.id,
             u.name,
             u.username,
             u.avatar,
             u.bio,
             u.plan,
             u.tag,
             u.private_profile

           FROM follows f

           JOIN users u
             ON u.id = f.following_id

           WHERE f.follower_id = $1

           ORDER BY f.created_at DESC`,

          [targetId]

        );


      res.json({

        restricted:
          false,

        following:
          result.rows.map(
            user =>
              publicUser(user)
          )

      });

    } catch (error) {

      console.error(
        "ERRO /following:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar os perfis seguidos."
      });

    }

  }
);


/* =====================================================
   ESQUECI MINHA SENHA
===================================================== */

app.post(
  "/api/auth/forgot-password",
  async (req, res) => {

    try {

      if (!db) {
      return res.status(500).json({
          error:
            "Banco de dados não configurado."
        });
      }

      if (!mailer) {
        return res.status(500).json({
          error:
            "Serviço de e-mail não configurado."
        });
      }

      const email =
        typeof req.body.email === "string"
          ? req.body.email.trim().toLowerCase()
          : "";

      if (!validEmail(email)) {

        return res.status(400).json({
          error:
            "Digite um e-mail válido."
        });

      }


      const result =
        await db.query(

          `SELECT
             id,
             name,
             email

           FROM users

           WHERE email = $1

           LIMIT 1`,

          [email]

        );


      /*
       * Mesmo que a conta não exista,
       * retornamos uma mensagem genérica.
       * Isso evita revelar quais e-mails
       * estão cadastrados.
       */

      if (!result.rowCount) {

        return res.json({

          success:
            true,

          message:
            "Se esse e-mail estiver cadastrado, enviaremos um código."

        });

      }


      const user =
        result.rows[0];


      const code =
        await createEmailCode(
          user.id,
          "reset_password"
        );


      await sendVerificationEmail(
        user.email,
        user.name,
        code,
        "reset_password"
      );


      res.json({

        success:
          true,

        message:
          "Se esse e-mail estiver cadastrado, enviaremos um código."

      });

    } catch (error) {

      console.error(
        "ERRO /forgot-password:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível enviar o código."
      });

    }

  }
);


/* =====================================================
   REDEFINIR SENHA
===================================================== */

app.post(
  "/api/auth/reset-password",
  async (req, res) => {

    try {

      if (!db) {
        return res.status(500).json({
          error:
            "Banco de dados não configurado."
        });
      }


      const email =
        typeof req.body.email === "string"
          ? req.body.email.trim().toLowerCase()
          : "";


      const code =
        String(
          req.body.code || ""
        ).trim();


      const newPassword =
        typeof req.body.password === "string"
          ? req.body.password
          : "";


      if (!validEmail(email)) {

        return res.status(400).json({
          error:
            "E-mail inválido."
        });

      }


      if (
        !/^\d{6}$/.test(code)
      ) {

        return res.status(400).json({
          error:
            "Digite o código de 6 dígitos."
        });

      }


      if (
        newPassword.length < 8 ||
        newPassword.length > 72
      ) {

        return res.status(400).json({
          error:
            "A nova senha deve ter entre 8 e 72 caracteres."
        });

      }


      const userResult =
        await db.query(

          `SELECT *
           FROM users
           WHERE email = $1
           LIMIT 1`,

          [email]

        );


      if (!userResult.rowCount) {

        return res.status(400).json({
          error:
            "Código inválido ou expirado."
        });

      }


      const user =
        userResult.rows[0];


      const codeResult =
        await db.query(

          `SELECT *
           FROM email_verification_codes

           WHERE user_id = $1

           AND purpose = 'reset_password'

           ORDER BY created_at DESC

           LIMIT 1`,

          [user.id]

        );


      if (!codeResult.rowCount) {

        return res.status(400).json({
          error:
            "Código inválido ou expirado."
        });

      }


      const savedCode =
        codeResult.rows[0];


      if (
        new Date(
          savedCode.expires_at
        ) < new Date()
      ) {

        return res.status(400).json({
          error:
            "Código expirado."
        });

      }


      if (
        savedCode.attempts >= 5
      ) {

        return res.status(429).json({
          error:
            "Número máximo de tentativas atingido."
        });

      }


      const correct =
        await bcrypt.compare(
          code,
          savedCode.code_hash
        );


      if (!correct) {

        await db.query(

          `UPDATE
             email_verification_codes

           SET attempts =
             attempts + 1

           WHERE id = $1`,

          [savedCode.id]

        );


        return res.status(400).json({
          error:
            "Código incorreto."
        });

      }


      const passwordHash =
        await bcrypt.hash(
          newPassword,
          12
        );


      await db.query(

        `UPDATE users

         SET password_hash = $1

         WHERE id = $2`,

        [
          passwordHash,
          user.id
        ]

      );


      await db.query(

        `DELETE FROM
           email_verification_codes

         WHERE user_id = $1

         AND purpose = 'reset_password'`,

        [user.id]

      );


      res.json({

        success:
          true,

        message:
          "Senha alterada com sucesso."

      });

    } catch (error) {

      console.error(
        "ERRO /reset-password:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível alterar a senha."
      });

    }

  }
);


/* =====================================================
   ALTERAR SENHA LOGADO
===================================================== */

app.patch(
  "/api/auth/password",
  authRequired,
  async (req, res) => {

    try {

      if (!db) {
        return res.status(500).json({
          error:
            "Banco de dados não configurado."
        });
      }


      const currentPassword =
        typeof req.body.currentPassword === "string"
          ? req.body.currentPassword
          : "";


      const newPassword =
        typeof req.body.newPassword === "string"
          ? req.body.newPassword
          : "";


      if (!currentPassword) {

        return res.status(400).json({
          error:
            "Digite sua senha atual."
        });

      }


      if (
        newPassword.length < 8 ||
        newPassword.length > 72
      ) {

        return res.status(400).json({
          error:
            "A nova senha deve ter entre 8 e 72 caracteres."
        });

      }


      const result =
        await db.query(

          `SELECT
             id,
             password_hash

           FROM users

           WHERE id = $1

           LIMIT 1`,

          [req.auth.sub]

        );


      if (!result.rowCount) {

        return res.status(404).json({
          error:
            "Usuário não encontrado."
        });

      }


      const user =
        result.rows[0];


      const valid =
        await bcrypt.compare(
          currentPassword,
          user.password_hash
        );


      if (!valid) {

        return res.status(400).json({
          error:
            "A senha atual está incorreta."
        });

      }


      const passwordHash =
        await bcrypt.hash(
          newPassword,
          12
        );


      await db.query(

        `UPDATE users

         SET password_hash = $1

         WHERE id = $2`,

        [
          passwordHash,
          user.id
        ]

      );


      res.json({

        success:
          true,

        message:
          "Senha alterada com sucesso."

      });

    } catch (error) {

      console.error(
        "ERRO /auth/password:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível alterar a senha."
      });

    }

  }
);


/* =====================================================
   MEUS SEGUIDORES / SEGUINDO
===================================================== */

app.get(
  "/api/auth/follow-state/:id",
  authRequired,
  async (req, res) => {

    try {

      if (!db) {
        return res.status(500).json({
          error:
            "Banco de dados não configurado."
        });
      }

      const state =
        await getFollowState(
          req.auth.sub,
          req.params.id
        );

      res.json(state);

    } catch (error) {

      console.error(
        "ERRO /follow-state:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível consultar o relacionamento."
      });

    }

  }
);


/* =====================================================
   CRIAR POST
===================================================== */

app.post(
  "/api/posts",
  authRequired,
  async (req, res) => {

    try {

      if (!db) {
        return res.status(500).json({
          error:
            "Banco de dados não configurado."
        });
      }


      const image =
        typeof req.body.image === "string"
          ? req.body.image.trim()
          : "";


      const caption =
        typeof req.body.caption === "string"
          ? req.body.caption.trim()
          : "";


      if (
        image &&
        !validImage(image)
      ) {

        return res.status(400).json({
          error:
            "Imagem inválida."
        });

      }


      const userResult =
        await db.query(

          `SELECT
             id,
             name,
             username,
             avatar

           FROM users

           WHERE id = $1

           LIMIT 1`,

          [req.auth.sub]

        );


      if (!userResult.rowCount) {

        return res.status(404).json({
          error:
            "Usuário não encontrado."
        });

      }


      const user =
        userResult.rows[0];


      const post =
        createItem(

          image,

          caption,

          user.id,

          user.name,

          user.username,

          user.avatar

        );


      posts.unshift(
        post
      );


      await db.query(

        `UPDATE users

         SET posts_count =
           posts_count + 1

         WHERE id = $1`,

        [user.id]

      );


      res.status(201).json({

        success:
          true,

        post

      });

    } catch (error) {

      console.error(
        "ERRO /posts:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível publicar."
      });

    }

  }
);


/* =====================================================
   LISTAR POSTS
===================================================== */

app.get(
  "/api/posts",
  optionalAuth,
  async (req, res) => {

    try {

      let visiblePosts =
        posts.slice();


      /*
       * Se o autor possui perfil privado,
       * somente usuários com acesso podem
       * visualizar a publicação.
       */

      if (
        db &&
        visiblePosts.length
      ) {

        const filtered = [];

        for (
          const post of visiblePosts
        ) {

          if (!post.userId) {

            filtered.push(
              post
            );

            continue;

          }


          const userResult =
            await db.query(

              `SELECT
                 id,
                 private_profile

               FROM users

               WHERE id = $1

               LIMIT 1`,

              [post.userId]

            );


          if (!userResult.rowCount) {

            filtered.push(
              post
            );

            continue;

          }


          const user =
            userResult.rows[0];


          const access =
            await getProfileAccess(
              req.auth?.sub || null,
              user
            );


          if (
            access.canView
          ) {

            filtered.push(
              post
            );

          }

        }


        visiblePosts =
          filtered;

      }


      const userId = req.auth?.sub || null;

const likeRows = await db.query(
    `
    SELECT
        post_id,
        COUNT(*)::int AS likes
    FROM post_likes
    GROUP BY post_id
    `
);

const userLikeRows = userId
    ? await db.query(
        `
        SELECT post_id
        FROM post_likes
        WHERE user_id = $1
        `,
        [userId]
    )
    : { rows: [] };

const likeCounts = new Map(
    likeRows.rows.map(row => [
        String(row.post_id),
        Number(row.likes || 0)
    ])
);

const likedPosts = new Set(
    userLikeRows.rows.map(row =>
        String(row.post_id)
    )
);

const postsWithLikes = visiblePosts.map(post => ({
    ...post,
    likes: likeCounts.get(String(post.id)) || 0,
    liked: likedPosts.has(String(post.id))
}));

res.json({
    posts: postsWithLikes
});

    } catch (error) {

      console.error(
        "ERRO /api/posts:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar as publicações."
      });

    }

  }
);


/* =====================================================
   CURTIR POST
===================================================== */

app.post("/api/posts/:id/like", async (req, res) => {
  try {
    const postId = String(req.params.id || "").trim();
    const userId = String(req.body.userId || "").trim();

    if (!postId) {
      return res.status(400).json({
        error: "Publicação não identificada."
      });
    }

    if (!userId) {
      return res.status(400).json({
        error: "Usuário não identificado."
      });
    }

    if (!db) {
      return res.status(500).json({
        error: "Banco de dados não configurado."
      });
    }

    /*
     * A publicação pode estar na memória com o mesmo ID.
     * Não usamos isso como condição obrigatória para a curtida.
     */
    const post = posts.find(
      p => String(p.id) === postId
    );

    /*
     * Verifica se este usuário já curtiu.
     */
    const existing = await db.query(
      `
      SELECT 1
      FROM post_likes
      WHERE post_id = $1
        AND user_id = $2
      LIMIT 1
      `,
      [postId, userId]
    );

    let liked;

    if (existing.rowCount > 0) {

      await db.query(
        `
        DELETE FROM post_likes
        WHERE post_id = $1
          AND user_id = $2
        `,
        [postId, userId]
      );

      liked = false;

    } else {

      await db.query(
        `
        INSERT INTO post_likes
          (post_id, user_id)
        VALUES
          ($1, $2)
        ON CONFLICT DO NOTHING
        `,
        [postId, userId]
      );

      liked = true;
    }

    /*
     * Conta novamente as curtidas.
     */
    const count = await db.query(
      `
      SELECT COUNT(*)::int AS likes
      FROM post_likes
      WHERE post_id = $1
      `,
      [postId]
    );

    const likes = Number(
      count.rows[0]?.likes || 0
    );

    /*
     * Atualiza a publicação em memória,
     * caso ela esteja disponível.
     */
    if (post) {
      post.likes = likes;
      post.liked = liked;
    }

    /*
     * Notificação para o dono da publicação.
     */
    if (
      liked &&
      post &&
      post.userId &&
      String(post.userId) !== userId
    ) {
      try {

        const actor = await db.query(
          `
          SELECT name
          FROM users
          WHERE id = $1
          LIMIT 1
          `,
          [userId]
        );

        const actorName =
          actor.rows[0]?.name || "Alguém";

        await createAccountNotification(
          post.userId,
          userId,
          "like",
          actorName + " curtiu sua publicação",
          "Toque para abrir a publicação.",
          postId
        );

      } catch (notificationError) {
        console.error(
          "ERRO AO CRIAR NOTIFICAÇÃO DE CURTIDA:",
          notificationError
        );
      }
    }

    return res.json({
      success: true,
      liked,
      likes
    });

  } catch (error) {

    console.error(
      "ERRO /api/posts/:id/like:",
      error
    );

    return res.status(500).json({
      error: "Não foi possível alterar a curtida."
    });
  }
});

/* =====================================================
   DESCURTIR POST
===================================================== */

app.delete(
  "/api/posts/:id/like",
  authRequired,
  async (req, res) => {

    try {

      const post =
        find(
          posts,
          req.params.id
        );


      if (!post) {

        return res.status(404).json({
          error:
            "Publicação não encontrada."
        });

      }


      const result =
        await db.query(

          `DELETE FROM post_likes

           WHERE post_id = $1

           AND user_id = $2

           RETURNING post_id`,

          [
            post.id,
            req.auth.sub
          ]

        );


      if (result.rowCount) {

        post.likes =
          Math.max(
            0,
            Number(post.likes || 0) - 1
          );

      }


      post.liked =
        false;


      res.json({

        liked:
          false,

        likes:
          post.likes

      });

    } catch (error) {

      console.error(
        "ERRO /unlike:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível remover a curtida."
      });

    }

  }
);


/* =====================================================
   COMENTAR
===================================================== */

app.post(
  "/api/posts/:id/comments",
  authRequired,
  async (req, res) => {

    try {

      const post =
        find(
          posts,
          req.params.id
        );


      if (!post) {

        return res.status(404).json({
          error:
            "Publicação não encontrada."
        });

      }


      const text =
        typeof req.body.text === "string"
          ? req.body.text.trim()
          : "";


      if (!text) {

        return res.status(400).json({
          error:
            "Digite um comentário."
        });

      }


      if (text.length > 1000) {

        return res.status(400).json({
          error:
            "Comentário muito grande."
        });

      }


      const userResult =
        await db.query(

          `SELECT
             id,
             name,
             username,
             avatar

           FROM users

           WHERE id = $1

           LIMIT 1`,

          [req.auth.sub]

        );


      if (!userResult.rowCount) {

        return res.status(404).json({
          error:
            "Usuário não encontrado."
        });

      }


      const user =
        userResult.rows[0];


      const comment = {

        id:
          id(),

        text,

        userId:
          user.id,

        userName:
          user.name,

        username:
          user.username,

        avatar:
          user.avatar || "",

        likes:
          0,

        createdAt:
          timeNow()

      };


      if (!Array.isArray(post.comments)) {

        post.comments =
          [];

      }


      post.comments.push(
        comment
      );


      res.status(201).json({

        success:
          true,

        comment

      });

    } catch (error) {

      console.error(
        "ERRO /comments:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível comentar."
      });

    }

  }
);
/* =====================================================
   EXCLUIR PUBLICAÇÃO
===================================================== */

app.delete(
  "/api/posts/:id",
  authRequired,
  async (req, res) => {

    try {

      const index =
        posts.findIndex(
          post =>
            String(post.id) ===
            String(req.params.id)
        );


      if (index < 0) {

        return res.status(404).json({
          error:
            "Publicação não encontrada."
        });

      }


      const post =
        posts[index];


      /*
       * Somente o autor pode excluir.
       */

      if (
        String(post.userId) !==
        String(req.auth.sub)
      ) {

        return res.status(403).json({
          error:
            "Você não pode excluir esta publicação."
        });

      }


      posts.splice(
        index,
        1
      );


      if (db) {

        await db.query(

          `DELETE FROM post_likes
           WHERE post_id = $1`,

          [post.id]

        );


        await db.query(

          `UPDATE users

           SET posts_count =
             GREATEST(
               posts_count - 1,
               0
             )

           WHERE id = $1`,

          [req.auth.sub]

        );

      }


      res.json({

        success:
          true

      });

    } catch (error) {

      console.error(
        "ERRO /delete post:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível excluir a publicação."
      });

    }

  }
);


/* =====================================================
   STATUS
===================================================== */

app.get(
  "/api/status",
  optionalAuth,
  async (req, res) => {

    try {

      let visibleStatuses =
        statuses.slice();


      /*
       * Respeita perfil privado.
       */

      if (
        db &&
        visibleStatuses.length
      ) {

        const filtered = [];

        for (
          const status of visibleStatuses
        ) {

          if (!status.userId) {

            filtered.push(
              status
            );

            continue;

          }


          const result =
            await db.query(

              `SELECT
                 id,
                 private_profile

               FROM users

               WHERE id = $1

               LIMIT 1`,

              [status.userId]

            );


          if (!result.rowCount) {

            filtered.push(
              status
            );

            continue;

          }


          const access =
            await getProfileAccess(
              req.auth?.sub || null,
              result.rows[0]
            );


          if (access.canView) {

            filtered.push(
              status
            );

          }

        }


        visibleStatuses =
          filtered;

      }


      res.json({

        success:
          true,

        statuses:
          visibleStatuses

      });

    } catch (error) {

      console.error(
        "ERRO /status:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar os Status."
      });

    }

  }
);


/* =====================================================
   CRIAR STATUS
===================================================== */

app.post(
  "/api/status",
  authRequired,
  async (req, res) => {

    try {

      const image =
        typeof req.body.image === "string"
          ? req.body.image.trim()
          : "";


      const caption =
        typeof req.body.caption === "string"
          ? req.body.caption.trim()
          : "";


      if (!validImage(image)) {

        return res.status(400).json({
          error:
            "Nenhuma imagem válida foi enviada."
        });

      }


      if (!db) {

        return res.status(500).json({
          error:
            "Banco de dados não configurado."
        });

      }


      const userResult =
        await db.query(

          `SELECT
             id,
             name,
             username,
             avatar

           FROM users

           WHERE id = $1

           LIMIT 1`,

          [req.auth.sub]

        );


      if (!userResult.rowCount) {

        return res.status(404).json({
          error:
            "Usuário não encontrado."
        });

      }


      const user =
        userResult.rows[0];


      const status =
        createItem(

          image,

          caption,

          user.id,

          user.name,

          user.username,

          user.avatar

        );


      /*
       * Timestamp para permitir ao
       * frontend controlar expiração.
       */

      status.createdAt =
        new Date().toISOString();


      status.expiresAt =
        new Date(
          Date.now() +
          24 * 60 * 60 * 1000
        ).toISOString();


      statuses.unshift(
        status
      );


      res.status(201).json({

        success:
          true,

        status

      });

    } catch (error) {

      console.error(
        "ERRO /status POST:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível publicar o Status."
      });

    }

  }
);


/* =====================================================
   EXCLUIR STATUS
===================================================== */

app.delete(
  "/api/status/:id",
  authRequired,
  async (req, res) => {

    try {

      const index =
        statuses.findIndex(
          status =>
            String(status.id) ===
            String(req.params.id)
        );


      if (index < 0) {

        return res.status(404).json({
          error:
            "Status não encontrado."
        });

      }


      const status =
        statuses[index];


      if (
        String(status.userId) !==
        String(req.auth.sub)
      ) {

        return res.status(403).json({
          error:
            "Você não pode excluir este Status."
        });

      }


      statuses.splice(
        index,
        1
      );


      res.json({

        success:
          true

      });

    } catch (error) {

      console.error(
        "ERRO /status DELETE:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível excluir o Status."
      });

    }

  }
);


/* =====================================================
   CURTIR STATUS
===================================================== */

app.post(
  "/api/status/:id/like",
  authRequired,
  async (req, res) => {

    try {

      const status =
        find(
          statuses,
          req.params.id
        );


      if (!status) {

        return res.status(404).json({
          error:
            "Status não encontrado."
        });

      }


      status.liked =
        !status.liked;


      status.likes =
        Math.max(
          0,
          Number(status.likes || 0) +
          (
            status.liked
              ? 1
              : -1
          )
        );


      res.json({

        success:
          true,

        liked:
          status.liked,

        likes:
          status.likes

      });

    } catch (error) {

      console.error(
        "ERRO /status like:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível alterar a curtida."
      });

    }

  }
);


/* =====================================================
   COMENTAR STATUS
===================================================== */

app.post(
  "/api/status/:id/comments",
  authRequired,
  async (req, res) => {

    try {

      const status =
        find(
          statuses,
          req.params.id
        );


      if (!status) {

        return res.status(404).json({
          error:
            "Status não encontrado."
        });

      }


      const text =
        typeof req.body.text === "string"
          ? req.body.text.trim()
          : "";


      if (!text) {

        return res.status(400).json({
          error:
            "Digite um comentário."
        });

      }


      if (text.length > 1000) {

        return res.status(400).json({
          error:
            "Comentário muito grande."
        });

      }


      const userResult =
        await db.query(

          `SELECT
             id,
             name,
             username,
             avatar

           FROM users

           WHERE id = $1

           LIMIT 1`,

          [req.auth.sub]

        );


      if (!userResult.rowCount) {

        return res.status(404).json({
          error:
            "Usuário não encontrado."
        });

      }


      const user =
        userResult.rows[0];


      const comment = {

        id:
          id(),

        userId:
          user.id,

        name:
          user.name,

        userName:
          user.name,

        username:
          user.username,

        avatar:
          user.avatar || "",

        text,

        likes:
          0,

        createdAt:
          timeNow()

      };


      status.comments.push(
        comment
      );


      res.status(201).json({

        success:
          true,

        comment

      });

    } catch (error) {

      console.error(
        "ERRO /status comments:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível comentar no Status."
      });

    }

  }
);


/* =====================================================
   NOVAIA — CHAT
===================================================== */

app.post(
  "/api/chat",
  async (req, res) => {

    try {

      const message =
        typeof req.body.message === "string"
          ? req.body.message.trim()
          : "";


      if (!message) {

        return res.status(400).json({
          error:
            "Digite uma mensagem."
        });

      }


      if (!OPENAI_API_KEY) {

        return res.status(500).json({
          error:
            "OPENAI_API_KEY não configurada no servidor."
        });

      }


      const response =
        await openai.responses.create({

          model:
            "gpt-5.6-luna",

          instructions:

`Você é a NovaAI,
assistente oficial da GeraçãoZ.

Responda em português do Brasil,
salvo quando o usuário pedir
outro idioma.

Seja natural, útil, clara e objetiva.

Não revele chaves de API,
senhas ou informações secretas
do sistema.`,

          input:
            message

        });


      const answer =
        response.output_text;


      if (!answer) {

        return res.status(502).json({
          error:
            "A NovaAI não retornou uma resposta."
        });

      }


      res.json({

        success:
          true,

        response:
          answer,

        output_text:
          answer

      });

    } catch (error) {

      console.error(
        "ERRO /api/chat:",
        error
      );

      res.status(500).json({

        error:
          error?.message ||
          "Erro ao conversar com a NovaAI."

      });

    }

  }
);


/* =====================================================
   GERAR IMAGEM
===================================================== */

app.post(
  "/api/image",
  async (req, res) => {

    try {

      const prompt =
        typeof req.body.prompt === "string"
          ? req.body.prompt.trim()
          : "";


      if (!prompt) {

        return res.status(400).json({
          error:
            "Informe o que você quer criar."
        });

      }


      if (!OPENAI_API_KEY) {

        return res.status(500).json({
          error:
            "OPENAI_API_KEY não configurada."
        });

      }


      const requestedCount =
        Number.parseInt(
          req.body.count,
          10
        );


      const count =
        Number.isFinite(
          requestedCount
        )

          ? Math.min(
              4,
              Math.max(
                1,
                requestedCount
              )
            )

          : 1;


      const results =
        await Promise.all(

          Array.from(
            {
              length:
                count
            },

            () =>
              openai.images.generate({

                model:
                  "gpt-image-2",

                prompt,

                size:
                  "1024x1024"

              })

          )

        );


      const images =
        results

          .map(
            result =>
              result?.data?.[0]?.b64_json
          )

          .filter(Boolean)

          .map(
            base64 =>
              "data:image/png;base64," +
              base64
          );


      if (!images.length) {

        throw new Error(
          "A API não retornou as imagens."
        );

      }


      res.json({

        success:
          true,

        images,

        image:
          images[0],

        imageUrl:
          images[0],

        url:
          images[0]

      });

    } catch (error) {

      console.error(
        "ERRO /api/image:",
        error
      );

      res.status(500).json({

        error:
          error?.message ||
          "Não foi possível gerar a imagem."

      });

    }

  }
);


/* =====================================================
   EDITAR IMAGEM
===================================================== */

app.post(
  "/api/image/edit",
  upload.single("image"),
  async (req, res) => {

    try {

      if (!req.file) {

        return res.status(400).json({
          error:
            "Nenhuma imagem foi enviada."
        });

      }


      if (!OPENAI_API_KEY) {

        return res.status(500).json({
          error:
            "OPENAI_API_KEY não configurada."
        });

      }


      const prompt =
        typeof req.body.prompt === "string" &&
        req.body.prompt.trim()

          ? req.body.prompt.trim()

          : "Edite esta imagem de forma criativa.";


      const file =
        new File(

          [
            req.file.buffer
          ],

          req.file.originalname ||
            "imagem.png",

          {
            type:
              req.file.mimetype ||
              "image/png"
          }

        );


      const result =
        await openai.images.edit({

          model:
            "gpt-image-2",

          image:
            file,

          prompt,

          size:
            "1024x1024"

        });


      const imageData =
        result?.data?.[0]?.b64_json;


      if (!imageData) {

        throw new Error(
          "A API não retornou a imagem editada."
        );

      }


      const image =
        "data:image/png;base64," +
        imageData;


      res.json({

        success:
          true,

        image,

        imageUrl:
          image,

        url:
          image

      });

    } catch (error) {

      console.error(
        "ERRO /api/image/edit:",
        error
      );

      res.status(500).json({

        error:
          error?.message ||
          "Não foi possível editar a imagem."

      });

    }

  }
);


/* =====================================================
   CONVERSAS
===================================================== */

app.get(
  "/api/messages/conversations",
  authRequired,
  async (req, res) => {

    try {

      const result =
        await db.query(

          `SELECT DISTINCT ON (other_id)

             other_id AS "userId",

             other_name AS "name",

             other_username AS "username",

             other_avatar AS "avatar",

             text AS "lastMessage",

             created_at AS "createdAt"

           FROM (

             SELECT

               CASE

                 WHEN dm.sender_id = $1
                 THEN dm.receiver_id

                 ELSE dm.sender_id

               END AS other_id,

               u.name AS other_name,

               u.username AS other_username,

               COALESCE(
                 u.avatar,
                 ''
               ) AS other_avatar,

               dm.text,

               dm.created_at

             FROM direct_messages dm

             JOIN users u

               ON u.id =

                 CASE

                   WHEN dm.sender_id = $1
                   THEN dm.receiver_id

                   ELSE dm.sender_id

                 END

             WHERE

               dm.sender_id = $1

               OR

               dm.receiver_id = $1

           ) x

           ORDER BY
             other_id,
             created_at DESC`,

          [req.auth.sub]

        );


      const conversations =
        result.rows

          .sort(
            (a, b) =>
              new Date(
                b.createdAt
              ) -
              new Date(
                a.createdAt
              )
          )

          .map(
            row => ({

              userId:
                String(
                  row.userId
                ),

              name:
                row.name,

              username:
                row.username
                  ? "@" +
                    String(
                      row.username
                    ).replace(
                      /^@+/,
                      ""
                    )
                  : "@usuario",

              avatar:
                row.avatar || "",

              lastMessage:
                row.lastMessage || "",

              createdAt:
                row.createdAt

            })
          );


      res.json({

        success:
          true,

        conversations

      });

    } catch (error) {

      console.error(
        "ERRO /conversations:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar as conversas."
      });

    }

  }
);


/* =====================================================
   ABRIR CONVERSA
===================================================== */

app.get(
  "/api/messages/:userId",
  authRequired,
  async (req, res) => {

    try {

      const otherId =
        String(
          req.params.userId || ""
        ).trim();


      if (!otherId) {

        return res.status(400).json({
          error:
            "Usuário não identificado."
        });

      }


      const result =
        await db.query(

          `SELECT

             id,

             sender_id AS "from",

             receiver_id AS "to",

             text,

             created_at AS "createdAt"

           FROM direct_messages

           WHERE

             (
               sender_id = $1
               AND
               receiver_id = $2
             )

             OR

             (
               sender_id = $2
               AND
               receiver_id = $1
             )

           ORDER BY
             created_at ASC`,

          [
            req.auth.sub,
            otherId
          ]

        );


      res.json({

        success:
          true,

        messages:
          result.rows.map(
            row => ({

              id:
                String(
                  row.id
                ),

              from:
                String(
                  row.from
                ),

              to:
                String(
                  row.to
                ),

              text:
                row.text,

              createdAt:
                row.createdAt

            })
          )

      });

    } catch (error) {

      console.error(
        "ERRO /messages/:userId:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar as mensagens."
      });

    }

  }
);


/* =====================================================
   ENVIAR MENSAGEM
===================================================== */

app.post(
  "/api/messages",
  authRequired,
  async (req, res) => {

    try {

      const toUserId =
        String(
          req.body.toUserId || ""
        ).trim();


      const text =
        typeof req.body.text === "string"
          ? req.body.text.trim()
          : "";


      if (!toUserId) {

        return res.status(400).json({
          error:
            "Destinatário não identificado."
        });

      }


      if (
        toUserId ===
        String(req.auth.sub)
      ) {

        return res.status(400).json({
          error:
            "Você não pode enviar mensagem para si mesmo."
        });

      }


      if (!text) {

        return res.status(400).json({
          error:
            "Digite uma mensagem."
        });

      }


      if (text.length > 2000) {

        return res.status(400).json({
          error:
            "A mensagem deve ter no máximo 2000 caracteres."
        });

      }


      const receiver =
        await db.query(

          `SELECT
             id
           FROM users

           WHERE id = $1

           LIMIT 1`,

          [toUserId]

        );


      if (!receiver.rowCount) {

        return res.status(404).json({
          error:
            "Usuário não encontrado."
        });

      }


      const sender =
        await db.query(

          `SELECT
             name

           FROM users

           WHERE id = $1

           LIMIT 1`,

          [req.auth.sub]

        );


      const messageId =
        crypto.randomUUID();


      const result =
        await db.query(

          `INSERT INTO direct_messages

            (
              id,
              sender_id,
              receiver_id,
              text
            )

           VALUES
            (
              $1,
              $2,
              $3,
              $4
            )

           RETURNING

             id,

             sender_id AS "from",

             receiver_id AS "to",

             text,

             created_at AS "createdAt"`,

          [
            messageId,
            req.auth.sub,
            toUserId,
            text
          ]

        );


      const senderName =
        sender.rows[0]?.name ||
        "Usuário";


      await db.query(

        `INSERT INTO notifications

          (
            id,
            recipient_id,
            actor_id,
            type,
            title,
            text,
            target_id
          )

         VALUES

          (
            $1,
            $2,
            $3,
            'message',
            $4,
            $5,
            $6
          )`,

        [

          crypto.randomUUID(),

          toUserId,

          req.auth.sub,

          senderName +
            " enviou uma mensagem",

          text.length > 80
            ? text.slice(
                0,
                77
              ) + "..."
            : text,

          String(
            req.auth.sub
          )

        ]

      );


      const row =
        result.rows[0];


      res.status(201).json({

        success:
          true,

        message: {

          id:
            String(
              row.id
            ),

          from:
            String(
              row.from
            ),

          to:
            String(
              row.to
            ),

          text:
            row.text,

          createdAt:
            row.createdAt

        }

      });

    } catch (error) {

      console.error(
        "ERRO /messages:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível enviar a mensagem."
      });

    }

  }
);


/* =====================================================
   NOTIFICAÇÕES
===================================================== */

app.get(
  "/api/notifications",
  authRequired,
  async (req, res) => {

    try {

      const result =
        await db.query(

          `SELECT

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

             COALESCE(
               u.avatar,
               ''
             ) AS avatar

           FROM notifications n

           LEFT JOIN users u

             ON u.id =
                n.actor_id

           WHERE

             n.recipient_id = $1

           ORDER BY
             n.created_at DESC

           LIMIT 100`,

          [req.auth.sub]

        );


      res.json({

        success:
          true,

        notifications:
          result.rows.map(
            row => ({

              id:
                String(
                  row.id
                ),

              type:
                row.type,

              title:
                row.title,

              text:
                row.text || "",

              targetId:
                row.targetId || "",

              read:
                !!row.read,

              createdAt:
                row.createdAt,

              actorId:
                row.actorId
                  ? String(
                      row.actorId
                    )
                  : "",

              actorName:
                row.actorName ||
                "Usuário",

              actorUsername:
                row.actorUsername
                  ? "@" +
                    String(
                      row.actorUsername
                    ).replace(
                      /^@+/,
                      ""
                    )
                  : "@usuario",

              avatar:
                row.avatar || ""

            })
          )

      });

    } catch (error) {

      console.error(
        "ERRO /notifications:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar as notificações."
      });

    }

  }
);


/* =====================================================
   MARCAR NOTIFICAÇÕES COMO LIDAS
===================================================== */

app.post(
  "/api/notifications/read",
  authRequired,
  async (req, res) => {

    try {

      const ids =
        Array.isArray(
          req.body.ids
        )

          ? req.body.ids
              .map(String)
              .filter(Boolean)
              .slice(0, 100)

          : [];


      if (ids.length) {

        await db.query(

          `UPDATE notifications

           SET is_read = TRUE

           WHERE recipient_id = $1

           AND id = ANY(
             $2::uuid[]
           )`,

          [
            req.auth.sub,
            ids
          ]

        );

      } else {

        await db.query(

          `UPDATE notifications

           SET is_read = TRUE

           WHERE recipient_id = $1`,

          [
            req.auth.sub
          ]

        );

      }


      res.json({

        success:
          true

      });

    } catch (error) {

      console.error(
        "ERRO /notifications/read:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível marcar as notificações."
      });

    }

  }
);


/* =====================================================
   ERROS DE UPLOAD / SERVIDOR
===================================================== */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      "ERRO DO SERVIDOR:",
      error
    );


    if (
      error?.code ===
      "LIMIT_FILE_SIZE"
    ) {

      return res.status(413).json({

        error:
          "A imagem é muito grande. Limite: 10 MB."

      });

    }


    res.status(500).json({

      error:
        error?.message ||
        "Erro interno do servidor."

    });

  }
);


/* =====================================================
   INICIAR SERVIDOR
===================================================== */

async function startServer() {

  try {

    await initDatabase();


    /*
     * Testa a conexão SMTP.
     * Se o SMTP estiver configurado
     * mas houver algum problema,
     * mostramos no log sem derrubar
     * o servidor inteiro.
     */

    if (mailer) {

      try {

        await mailer.verify();

        console.log(
          "📧 SMTP: CONFIGURADO E PRONTO"
        );

      } catch (smtpError) {

        console.error(
          "⚠️ SMTP configurado, mas a conexão falhou:",
          smtpError.message
        );

      }

    } else {

      console.log(
        "📧 SMTP: NÃO CONFIGURADO"
      );

    }


    app.listen(
      PORT,
      () => {

        console.log(
          "================================="
        );

        console.log(
          "🚀 NovaAI + GeraçãoZ online"
        );

        console.log(
          "Porta:",
          PORT
        );

        console.log(
          "OpenAI:",
          OPENAI_API_KEY
            ? "CONFIGURADA"
            : "NÃO CONFIGURADA"
        );

        console.log(
          "Banco:",
          db
            ? "CONFIGURADO"
            : "NÃO CONFIGURADO"
        );

        console.log(
          "SMTP:",
          mailer
            ? "CONFIGURADO"
            : "NÃO CONFIGURADO"
        );

        console.log(
          "Contas: ATIVAS"
        );

        console.log(
          "Confirmação de e-mail: ATIVA"
        );

        console.log(
          "Recuperação de senha: ATIVA"
        );

        console.log(
          "Perfil privado: ATIVO"
        );

        console.log(
          "Seguir/deixar de seguir: ATIVO"
        );

        console.log(
          "Feed: ATIVO"
        );

        console.log(
          "Status: ATIVO"
        );

        console.log(
          "Mensagens: ATIVAS"
        );

        console.log(
          "Notificações: ATIVAS"
        );

        console.log(
          "NovaAI: ATIVA"
        );

        console.log(
          "================================="

        );

      }
    );

  } catch (error) {

    console.error(
      "❌ ERRO AO INICIALIZAR O SERVIDOR:",
      error
    );

    process.exit(1);

  }

}


startServer();
