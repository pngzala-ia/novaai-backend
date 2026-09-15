const express = require("express");
const cors = require("cors");
require("dotenv").config();

const OpenAI = require("openai");

const app = express();

/* =========================
   CONFIGURAÇÃO CORS
========================= */

const corsOptions = {
    origin: function (origin, callback) {

        // Permite chamadas sem Origin
        // e também o "Origin: null" do TrebEdit
        if (!origin || origin === "null") {
            return callback(null, true);
        }

        // Durante os testes, permite qualquer origem
        return callback(null, true);
    },

    methods: ["GET", "POST", "OPTIONS"],

    allowedHeaders: [
        "Content-Type",
        "Authorization"
    ],

    credentials: false,

    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

app.options("*", cors(corsOptions));

app.use(express.json());


/* =========================
   OPENAI
========================= */

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {

    console.error(
        "ERRO: OPENAI_API_KEY não foi configurada."
    );

}

const client = apiKey
    ? new OpenAI({
        apiKey: apiKey
      })
    : null;


/* =========================
   TESTE DO SERVIDOR
========================= */

app.get("/", (req, res) => {

    res.json({

        status: "online",

        message:
            "NovaAI Backend está funcionando!",

        openai_key:
            apiKey
                ? "configurado"
                : "não configurado"

    });

});


/* =========================
   CHAT NOVAAI
========================= */

app.post("/api/chat", async (req, res) => {

    try {

        const { message } = req.body || {};


        /* MENSAGEM VAZIA */

        if (
            !message ||
            typeof message !== "string" ||
            !message.trim()
        ) {

            return res.status(400).json({

                error:
                    "Mensagem vazia."

            });

        }


        /* API KEY */

        if (!apiKey || !client) {

            return res.status(500).json({

                error:
                    "OPENAI_API_KEY não configurada no servidor."

            });

        }


        /* CHAMADA OPENAI */

        const response =
            await client.responses.create({

                model: "gpt-5-mini",

                input: message.trim()

            });


        /* RESPOSTA */

        return res.json({

            reply:
                response.output_text ||
                "Não recebi uma resposta da IA."

        });


    } catch (error) {

        console.error(
            "Erro NovaAI:",
            error
        );


        const status =
            error?.status || 500;


        return res.status(status).json({

            error:
                error?.message ||
                "Não foi possível obter uma resposta da IA.",

            code:
                error?.code || null,

            type:
                error?.type || null

        });

    }

});


/* =========================
   SERVIDOR
========================= */

const PORT =
    process.env.PORT || 3000;


app
