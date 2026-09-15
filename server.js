const express = require("express");
const cors = require("cors");
const multer = require("multer");
require("dotenv").config();

const OpenAI = require("openai");

const app = express();

/* =========================================================
   CONFIGURAÇÕES
========================================================= */

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENAI_API_KEY;

const client = API_KEY
    ? new OpenAI({
        apiKey: API_KEY
    })
    : null;

/* =========================================================
   CORS
========================================================= */

const corsOptions = {
    origin: function (origin, callback) {

        // Permite file://, Acode, TrebEdit e clientes sem Origin
        if (!origin || origin === "null") {
            return callback(null, true);
        }

        // Durante o desenvolvimento aceitamos as origens
        return callback(null, true);
    },

    methods: [
        "GET",
        "POST",
        "OPTIONS"
    ],

    allowedHeaders: [
        "Content-Type",
        "Authorization"
    ],

    credentials: false,

    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

app.options("*", cors(corsOptions));

/* =========================================================
   JSON
========================================================= */

app.use(express.json({
    limit: "10mb"
}));

/* =========================================================
   UPLOAD DE IMAGENS
========================================================= */

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 50 * 1024 * 1024
    },

    fileFilter: function (req, file, callback) {

        const tiposPermitidos = [
            "image/png",
            "image/jpeg",
            "image/webp"
        ];

        if (!tiposPermitidos.includes(file.mimetype)) {

            return callback(
                new Error(
                    "Formato não permitido. Use PNG, JPG ou WEBP."
                )
            );
        }

        callback(null, true);
    }
});

/* =========================================================
   FUNÇÃO PARA TRATAR ERROS DA OPENAI
========================================================= */

function obterMensagemErro(error) {

    if (!error) {
        return "Erro desconhecido.";
    }

    if (error.message) {
        return error.message;
    }

    return "Não foi possível completar a solicitação.";
}

/* =========================================================
   STATUS
========================================================= */

app.get("/", (req, res) => {

    res.json({
        status: "online",
        service: "NovaAI",
        openai: API_KEY ? true : false
    });

});

/* =========================================================
   HEALTH
========================================================= */

app.get("/health", (req, res) => {

    res.json({
        status: "ok",
        service: "NovaAI",
        openai: !!API_KEY
    });

});

/* =========================================================
   CHAT
========================================================= */

app.post("/api/chat", async (req, res) => {

    try {

        const { message } = req.body || {};

        if (
            !message ||
            typeof message !== "string" ||
            !message.trim()
        ) {

            return res.status(400).json({
                error: "Mensagem vazia."
            });

        }

        if (!API_KEY || !client) {

            return res.status(500).json({
                error: "OPENAI_API_KEY não configurada no Render."
            });

        }

        const response = await client.responses.create({

            model: "gpt-5-mini",

            input: message.trim()

        });

        return res.json({

            reply:
                response.output_text ||
                "Não recebi uma resposta da NovaAI."

        });

    } catch (error) {

        console.error(
            "ERRO CHAT:",
            error
        );

        const status =
            error?.status || 500;

        return res.status(status).json({

            error:
                obterMensagemErro(error),

            code:
                error?.code || null

        });

    }

});

/* =========================================================
   GERAR IMAGEM
========================================================= */

app.post("/api/image", async (req, res) => {

    try {

        const { prompt } = req.body || {};

        if (
            !prompt ||
            typeof prompt !== "string" ||
            !prompt.trim()
        ) {

            return res.status(400).json({

                error:
                    "Descreva a imagem que deseja criar."

            });

        }

        if (!API_KEY) {

            return res.status(500).json({

                error:
                    "OPENAI_API_KEY não configurada no Render."

            });

        }

        console.log(
            "NovaAI: gerando imagem..."
        );

        /*
         * Usamos o endpoint de imagens diretamente.
         * Isso evita depender da versão do SDK instalada
         * para recursos novos de imagem.
         */

        const response =
            await fetch(
                "https://api.openai.com/v1/images/generations",
                {
                    method: "POST",

                    headers: {
                        "Authorization":
                            `Bearer ${API_KEY}`,

                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        model:
                            "gpt-image-2",

                        prompt:
                            prompt.trim(),

                        size:
                            "1024x1024",

                        quality:
                            "low",

                        n: 1

                    })
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            console.error(
                "ERRO OPENAI IMAGEM:",
                data
            );

            return res.status(
                response.status
            ).json({

                error:
                    data?.error?.message ||
                    "Erro ao gerar imagem."

            });

        }

        const imagem =
            data?.data?.[0]?.b64_json;

        if (!imagem) {

            return res.status(500).json({

                error:
                    "A OpenAI não retornou a imagem."

            });

        }

        console.log(
            "NovaAI: imagem criada."
        );

        return res.json({

            success: true,

            image:
                `data:image/png;base64,${imagem}`

        });

    } catch (error) {

        console.error(
            "ERRO GERAR IMAGEM:",
            error
        );

        return res.status(500).json({

            error:
                obterMensagemErro(error)

        });

    }

});

/* =========================================================
   EDITAR IMAGEM
========================================================= */

app.post(
    "/api/image/edit",
    upload.single("image"),
    async (req, res) => {

        try {

            if (!API_KEY) {

                return res.status(500).json({

                    error:
                        "OPENAI_API_KEY não configurada no Render."

                });

            }

            if (!req.file) {

                return res.status(400).json({

                    error:
                        "Nenhuma imagem foi enviada."

                });

            }

            const prompt =
                req.body?.prompt;

            if (
                !prompt ||
                typeof prompt !== "string" ||
                !prompt.trim()
            ) {

                return res.status(400).json({

                    error:
                        "Descreva o que deseja alterar na imagem."

                });

            }

            console.log(
                "NovaAI: editando imagem..."
            );

            /*
             * FormData para enviar a imagem
             * para a API da OpenAI.
             */

            const form =
                new FormData();

            form.append(
                "model",
                "gpt-image-2"
            );

            form.append(
                "prompt",
                prompt.trim()
            );

            form.append(
                "size",
                "1024x1024"
            );

            form.append(
                "quality",
                "low"
            );

            form.append(
                "image",
                new Blob(
                    [
                        req.file.buffer
                    ],
                    {
                        type:
                            req.file.mimetype
                    }
                ),
                req.file.originalname
            );

            const response =
                await fetch(
                    "https://api.openai.com/v1/images/edits",
                    {
                        method: "POST",

                        headers: {

                            "Authorization":
                                `Bearer ${API_KEY}`

                        },

                        body: form
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {

                console.error(
                    "ERRO OPENAI EDIT:",
                    data
                );

                return res.status(
                    response.status
                ).json({

                    error:
                        data?.error?.message ||
                        "Erro ao editar imagem."

                });

            }

            const imagem =
                data?.data?.[0]?.b64_json;

            if (!imagem) {

                return res.status(500).json({

                    error:
                        "A OpenAI não retornou a imagem editada."

                });

            }

            console.log(
                "NovaAI: imagem editada."
            );

            return res.json({

                success: true,

                image:
                    `data:image/png;base64,${imagem}`

            });

        } catch (error) {

            console.error(
                "ERRO EDITAR IMAGEM:",
                error
            );

            return res.status(500).json({

                error:
                    obterMensagemErro(error)

            });

        }

    }
);

/* =========================================================
   ERROS DE UPLOAD
========================================================= */

app.use(
    (error, req, res, next) => {

        if (
            error instanceof multer.MulterError
        ) {

            return res.status(400).json({

                error:
                    "Erro no upload da imagem: " +
                    error.message

            });

        }

        if (error) {

            return res.status(400).json({

                error:
                    error.message ||
                    "Erro no servidor."

            });

        }

        next();

    }
);

/* =========================================================
   SERVIDOR
========================================================= */

app.listen(
    PORT,
    () => {

        console.log(
            "================================"
        );

        console.log(
            "NovaAI Backend funcionando!"
        );

        console.log(
            `Porta: ${PORT}`
        );

        console.log(
            "OpenAI configurada:",
            API_KEY ? "true" : "false"
        );

        console.log(
            "Chat: /api/chat"
        );

        console.log(
            "Imagem: /api/image"
        );

        console.log(
            "Editar: /api/image/edit"
        );

        console.log(
            "================================"
        );

    }
);
