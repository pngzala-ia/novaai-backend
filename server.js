const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const multer = require("multer");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

const OPENAI_API_KEY =
    process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
    console.warn(
        "⚠️ OPENAI_API_KEY não configurada."
    );
}

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY
});


/* =====================================================
   CONFIGURAÇÃO
===================================================== */

app.use(
    cors({
        origin: "*",
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type"]
    })
);

app.use(
    express.json({
        limit: "2mb"
    })
);


/* =====================================================
   UPLOAD DE IMAGEM
===================================================== */

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 10 * 1024 * 1024
    },

    fileFilter: function(req, file, cb) {

        if (
            file.mimetype &&
            file.mimetype.startsWith("image/")
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
   ROTA PRINCIPAL
===================================================== */

app.get("/", function(req, res) {

    res.json({
        status: "online",
        app: "NovaAI",
        openai:
            !!OPENAI_API_KEY
    });

});


/* =====================================================
   HEALTH CHECK
===================================================== */

app.get("/api/health", function(req, res) {

    res.json({
        ok: true,
        openai:
            !!OPENAI_API_KEY
    });

});


/* =====================================================
   CHAT NORMAL
===================================================== */

app.post(
    "/api/chat",
    async function(req, res) {

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
                        `
Você é a NovaAI, assistente oficial
da GeraçãoZ.

Responda em português do Brasil,
a menos que o usuário peça outro idioma.

Seja natural, útil e objetiva.

IMPORTANTE:
Você é apenas o assistente de conversa.
Pedidos de geração ou edição de imagens
são tratados por rotas específicas
do servidor.
                        `,

                    input: message
                });


            const answer =
                response.output_text;


            if (!answer) {

                return res.status(502).json({
                    error:
                        "A API não retornou texto."
                });

            }


            return res.json({

                response: answer,

                output_text: answer

            });


        } catch (error) {

            console.error(
                "ERRO /api/chat:",
                error
            );


            return res.status(500).json({

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
    async function(req, res) {

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
                        "OPENAI_API_KEY não configurada no servidor."
                });

            }


            console.log(
                "🖼️ Gerando imagem:",
                prompt
            );


            const result =
                await openai.images.generate({

                    model:
                        "gpt-image-2",

                    prompt: prompt,

                    size:
                        "1024x1024"
                });


            if (
                !result ||
                !result.data ||
                !result.data[0]
            ) {

                throw new Error(
                    "A API de imagens não retornou dados."
                );

            }


            const imageData =
                result.data[0].b64_json;


            if (!imageData) {

                throw new Error(
                    "A API não retornou os dados da imagem."
                );

            }


            const imageUrl =
                "data:image/png;base64," +
                imageData;


            console.log(
                "✅ Imagem criada."
            );


            return res.json({

                success: true,

                image:
                    imageUrl,

                imageUrl:
                    imageUrl,

                url:
                    imageUrl

            });


        } catch (error) {

            console.error(
                "ERRO /api/image:",
                error
            );


            return res.status(500).json({

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
    async function(req, res) {

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
                        "OPENAI_API_KEY não configurada no servidor."
                });

            }


            const prompt =
                typeof req.body.prompt === "string" &&
                req.body.prompt.trim()
                    ? req.body.prompt.trim()
                    : "Edite esta imagem.";


            console.log(
                "✏️ Editando imagem:",
                prompt
            );


            /*
             * O SDK recebe um arquivo.
             */

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

                    prompt:
                        prompt,

                    size:
                        "1024x1024"
                });


            if (
                !result ||
                !result.data ||
                !result.data[0]
            ) {

                throw new Error(
                    "A API não retornou a imagem editada."
                );

            }


            const imageData =
                result.data[0].b64_json;


            if (!imageData) {

                throw new Error(
                    "Os dados da imagem editada não foram retornados."
                );

            }


            const imageUrl =
                "data:image/png;base64," +
                imageData;


            console.log(
                "✅ Imagem editada."
            );


            return res.json({

                success: true,

                image:
                    imageUrl,

                imageUrl:
                    imageUrl,

                url:
                    imageUrl

            });


        } catch (error) {

            console.error(
                "ERRO /api/image/edit:",
                error
            );


            return res.status(500).json({

                error:
                    error?.message ||
                    "Não foi possível editar a imagem."

            });

        }

    }
);


/* =====================================================
   ERROS DE UPLOAD
===================================================== */

app.use(
    function(error, req, res, next) {

        console.error(
            "ERRO DO SERVIDOR:",
            error
        );


        if (
            error &&
            error.code === "LIMIT_FILE_SIZE"
        ) {

            return res.status(413).json({
                error:
                    "A imagem é muito grande. Limite: 10 MB."
            });

        }


        return res.status(500).json({

            error:
                error?.message ||
                "Erro interno do servidor."

        });

    }
);


/* =====================================================
   INICIAR SERVIDOR
===================================================== */

app.listen(
    PORT,
    function() {

        console.log(
            "================================="
        );

        console.log(
            "🚀 NovaAI online"
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
            "================================="
        );

    }
);
