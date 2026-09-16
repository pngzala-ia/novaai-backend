const express = require("express");
const cors = require("cors");
require("dotenv").config();

const OpenAI = require("openai");
const { toFile } = require("openai");

const app = express();

/* =====================================================
   CONFIGURAÇÃO
===================================================== */

const PORT = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

/*
   A imagem em Base64 pode ser grande.
   Por isso aumentamos o limite do JSON.
*/
app.use(express.json({
    limit: "25mb"
}));

app.use(express.urlencoded({
    extended: true,
    limit: "25mb"
}));


/* =====================================================
   CORS
===================================================== */

const corsOptions = {

    origin: function(origin, callback) {

        /*
           Permite:
           - TrebEdit
           - file://
           - Preview
           - navegador
           - outros frontends
        */

        if (!origin || origin === "null") {
            return callback(null, true);
        }

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


/* =====================================================
   OPENAI
===================================================== */

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


/* =====================================================
   ROTA PRINCIPAL
===================================================== */

app.get("/", function(req, res) {

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


/* =====================================================
   HEALTH CHECK
===================================================== */

app.get("/health", function(req, res) {

    res.json({

        status: "ok",

        service: "NovaAI",

        openai: !!apiKey

    });

});


/* =====================================================
   CHAT
===================================================== */

app.post("/api/chat", async function(req, res) {

    try {

        const body = req.body || {};

        const message = body.message;


        /* ---------------------------------------------
           VALIDAR MENSAGEM
        --------------------------------------------- */

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


        /* ---------------------------------------------
           VERIFICAR API KEY
        --------------------------------------------- */

        if (!apiKey || !client) {

            return res.status(500).json({

                error:
                    "OPENAI_API_KEY não configurada no servidor."

            });

        }


        /* ---------------------------------------------
           CHAMAR NOVAAI
        --------------------------------------------- */

        const response =
            await client.responses.create({

                model: "gpt-5-mini",

                input:
                    message.trim()

            });


        /* ---------------------------------------------
           RESPOSTA
        --------------------------------------------- */

        return res.json({

            reply:
                response.output_text ||
                "Não recebi uma resposta da IA."

        });

    }

    catch(error) {

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


/* =====================================================
   CRIAR IMAGEM
===================================================== */

app.post("/api/image", async function(req, res) {

    try {

        const body = req.body || {};

        const prompt = body.prompt;


        /* ---------------------------------------------
           VALIDAR PROMPT
        --------------------------------------------- */

        if (
            !prompt ||
            typeof prompt !== "string" ||
            !prompt.trim()
        ) {

            return res.status(400).json({

                error:
                    "Digite uma descrição para a imagem."

            });

        }


        /* ---------------------------------------------
           VERIFICAR API
        --------------------------------------------- */

        if (!apiKey || !client) {

            return res.status(500).json({

                error:
                    "OPENAI_API_KEY não configurada no servidor."

            });

        }


        console.log(
            "Criando imagem..."
        );

        console.log(
            "Prompt:",
            prompt
        );


        /* ---------------------------------------------
           GERAR IMAGEM
        --------------------------------------------- */

        const result =
            await client.images.generate({

                model: "gpt-image-1",

                prompt:
                    prompt.trim(),

                size:
                    "1024x1024"

            });


        /* ---------------------------------------------
           PEGAR IMAGEM
        --------------------------------------------- */

        if (
            !result ||
            !result.data ||
            !result.data.length
        ) {

            throw new Error(
                "A OpenAI não retornou uma imagem."
            );

        }


        const image =
            result.data[0];


        if (!image.b64_json) {

            throw new Error(
                "A imagem foi criada, mas não foi retornada em Base64."
            );

        }


        /* ---------------------------------------------
           RETORNAR PARA O TREBEDIT
        --------------------------------------------- */

        return res.json({

            image:
                "data:image/png;base64," +
                image.b64_json

        });

    }

    catch(error) {

        console.error(
            "ERRO AO CRIAR IMAGEM:",
            error
        );

        return res.status(
            error?.status || 500
        ).json({

            error:
                error?.message ||
                "Erro ao criar imagem.",

            code:
                error?.code || null,

            type:
                error?.type || null

        });

    }

});


/* =====================================================
   EDITAR IMAGEM
===================================================== */

app.post("/api/image/edit", async function(req, res) {

    try {

        const body = req.body || {};

        const prompt = body.prompt;

        const imageBase64 = body.image;


        /* =============================================
           VALIDAR PROMPT
        ============================================= */

        if (
            !prompt ||
            typeof prompt !== "string" ||
            !prompt.trim()
        ) {

            return res.status(400).json({

                error:
                    "Diga o que você quer alterar na imagem."

            });

        }


        /* =============================================
           VALIDAR IMAGEM
        ============================================= */

        if (
            !imageBase64 ||
            typeof imageBase64 !== "string"
        ) {

            return res.status(400).json({

                error:
                    "Nenhuma imagem foi enviada."

            });

        }


        /* =============================================
           VERIFICAR API KEY
        ============================================= */

        if (!apiKey || !client) {

            return res.status(500).json({

                error:
                    "OPENAI_API_KEY não configurada no servidor."

            });

        }


        console.log(
            "Recebida solicitação de edição de imagem."
        );

        console.log(
            "Prompt de edição:",
            prompt
        );


        /* =============================================
           SEPARAR O BASE64
        ============================================= */

        let mimeType =
            "image/jpeg";

        let base64Data =
            imageBase64;


        /*
           Exemplo recebido:

           data:image/jpeg;base64,/9j/4AAQ...

           Precisamos retirar:

           data:image/jpeg;base64,
        */

        if (
            imageBase64.startsWith(
                "data:"
            )
        ) {

            const match =
                imageBase64.match(
                    /^data:([^;]+);base64,(.*)$/
                );

            if (!match) {

                return res.status(400).json({

                    error:
                        "Formato da imagem inválido."

                });

            }

            mimeType =
                match[1];

            base64Data =
                match[2];

        }


        /* =============================================
           VERIFICAR FORMATO
        ============================================= */

        const allowedTypes = [

            "image/jpeg",

            "image/jpg",

            "image/png",

            "image/webp"

        ];


        if (
            !allowedTypes.includes(
                mimeType
            )
        ) {

            return res.status(400).json({

                error:
                    "Formato de imagem não suportado. Use JPG, PNG ou WEBP."

            });

        }


        /* =============================================
           CONVERTER BASE64 PARA BUFFER
        ============================================= */

        let imageBuffer;

        try {

            imageBuffer =
                Buffer.from(
                    base64Data,
                    "base64"
                );

        }

        catch(error) {

            return res.status(400).json({

                error:
                    "Não foi possível ler a imagem enviada."

            });

        }


        /* =============================================
           VERIFICAR TAMANHO
        ============================================= */

        if (
            !imageBuffer ||
            imageBuffer.length === 0
        ) {

            return res.status(400).json({

                error:
                    "A imagem enviada está vazia."

            });

        }


        /*
           Limite de segurança do nosso backend:

           aproximadamente 20 MB
        */

        const maxSize =
            20 * 1024 * 1024;


        if (
            imageBuffer.length >
            maxSize
        ) {

            return res.status(413).json({

                error:
                    "A imagem é muito grande. Use uma imagem de até 20 MB."

            });

        }


        console.log(
            "Imagem recebida:",
            Math.round(
                imageBuffer.length / 1024
            ),
            "KB"
        );


        /* =============================================
           DEFINIR EXTENSÃO
        ============================================= */

        let extension =
            "jpg";


        if (
            mimeType === "image/png"
        ) {

            extension =
                "png";

        }

        else if (
            mimeType === "image/webp"
        ) {

            extension =
                "webp";

        }


        const fileName =
            "imagem-original." +
            extension;


        /* =============================================
           CONVERTER BUFFER PARA ARQUIVO
        ============================================= */

        const imageFile =
            await toFile(

                imageBuffer,

                fileName,

                {
                    type:
                        mimeType
                }

            );


        /* =============================================
           ENVIAR PARA OPENAI
        ============================================= */

        console.log(
            "Enviando imagem para edição..."
        );


        const result =
            await client.images.edit({

                model:
                    "gpt-image-1",

                image:
                    imageFile,

                prompt:
                    prompt.trim(),

                size:
                    "1024x1024"

            });


        /* =============================================
           VERIFICAR RESPOSTA
        ============================================= */

        if (
            !result ||
            !result.data ||
            !result.data.length
        ) {

            throw new Error(
                "A OpenAI não retornou a imagem editada."
            );

        }


        const editedImage =
            result.data[0];


        if (
            !editedImage.b64_json
        ) {

            throw new Error(
                "A imagem editada não foi retornada em Base64."
            );

        }


        console.log(
            "Imagem editada com sucesso."
        );


        /* =============================================
           RETORNAR IMAGEM
        ============================================= */

        return res.json({

            image:
                "data:image/png;base64," +
                editedImage.b64_json

        });

    }

    catch(error) {

        console.error(
            "================================="
        );

        console.error(
            "ERRO AO EDITAR IMAGEM"
        );

        console.error(
            error
        );

        console.error(
            "================================="
        );


        return res.status(
            error?.status || 500
        ).json({

            error:
                error?.message ||
                "Não foi possível editar a imagem.",

            code:
                error?.code || null,

            type:
                error?.type || null

        });

    }

});


/* =====================================================
   TRATAMENTO DE JSON GRANDE
===================================================== */

app.use(function(err, req, res, next) {

    if (
        err &&
        err.type ===
        "entity.too.large"
    ) {

        return res.status(413).json({

            error:
                "A imagem enviada é muito grande."

        });

    }


    console.error(
        "Erro interno:",
        err
    );


    return res.status(500).json({

        error:
            "Erro interno no servidor."

    });

});


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
            "NovaAI Backend iniciado."
        );

        console.log(
            "Porta:",
            PORT
        );

        console.log(
            "OpenAI:",
            apiKey
                ? "CONFIGURADA"
                : "NÃO CONFIGURADA"
        );

        console.log(
            "================================="
        );

    }
);
