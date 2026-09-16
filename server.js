import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI, { toFile } from "openai";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

const OPENAI_API_KEY =
    process.env.OPENAI_API_KEY;

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


/*
   Aumentamos o limite porque imagens enviadas
   pelo navegador podem ser grandes.
*/
app.use(
    express.json({
        limit: "15mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "15mb"
    })
);


/* =====================================================
   FUNÇÕES AUXILIARES
===================================================== */

function sendError(res, status, message, error = null){

    console.error(
        "[NovaAI]",
        error || message
    );

    return res.status(status).json({
        error: message
    });
}


/* =====================================================
   ROTA PRINCIPAL
===================================================== */

app.get("/", (req, res) => {

    res.json({

        status: "online",

        service: "NovaAI",

        api_configured:
            Boolean(OPENAI_API_KEY),

        routes: {

            chat: "/api/chat",

            image: "/api/image",

            image_edit: "/api/image/edit"

        }

    });

});


/* =====================================================
   TESTE DA API
===================================================== */

app.get("/api/status", (req, res) => {

    res.json({

        ok: true,

        api_configured:
            Boolean(OPENAI_API_KEY)

    });

});


/* =====================================================
   CHAT NORMAL
===================================================== */

app.post("/api/chat", async (req, res) => {

    try {

        if(!OPENAI_API_KEY){

            return sendError(
                res,
                500,
                "OPENAI_API_KEY não está configurada no Render."
            );

        }


        const message =
            typeof req.body?.message === "string"
                ? req.body.message.trim()
                : "";


        if(!message){

            return sendError(
                res,
                400,
                "Mensagem vazia."
            );

        }


        console.log(
            "[NovaAI] Chat:",
            message
        );


        const response =
            await openai.responses.create({

                model:
                    process.env.CHAT_MODEL ||
                    "gpt-5-mini",

                instructions:
                    `
Você é a NovaAI, assistente oficial
da GeraçãoZ.

Responda em português do Brasil,
de maneira natural, clara e útil.

Quando o usuário pedir para criar,
gerar ou fazer uma imagem, o frontend
da GeraçãoZ deve tratar esse pedido
como geração de imagem. Não diga que
você não pode gerar imagens.
                    `.trim(),

                input: message

            });


        const answer =
            response.output_text;


        if(!answer){

            return sendError(
                res,
                502,
                "A API não retornou uma resposta."
            );

        }


        return res.json({

            response: answer,

            output_text: answer

        });


    } catch(error){

        return sendError(
            res,
            500,
            error?.message ||
            "Erro ao conversar com a NovaAI.",
            error
        );

    }

});


/* =====================================================
   GERAR IMAGEM
===================================================== */

app.post("/api/image", async (req, res) => {

    try {

        if(!OPENAI_API_KEY){

            return sendError(
                res,
                500,
                "OPENAI_API_KEY não está configurada no Render."
            );

        }


        const prompt =
            typeof req.body?.prompt === "string"
                ? req.body.prompt.trim()
                : "";


        if(!prompt){

            return sendError(
                res,
                400,
                "O prompt da imagem está vazio."
            );

        }


        /*
          Limite simples para evitar pedidos
          gigantes enviados acidentalmente.
        */
        if(prompt.length > 10000){

            return sendError(
                res,
                400,
                "O pedido de imagem é muito grande."
            );

        }


        console.log(
            "[NovaAI] Gerando imagem:",
            prompt
        );


        const result =
            await openai.images.generate({

                model:
                    process.env.IMAGE_MODEL ||
                    "gpt-image-1",

                prompt: prompt,

                size:
                    process.env.IMAGE_SIZE ||
                    "1024x1024",

                quality:
                    process.env.IMAGE_QUALITY ||
                    "medium",

                n: 1,

                output_format: "png"

            });


        const image =
            result?.data?.[0];


        if(!image){

            return sendError(
                res,
                502,
                "A API de imagens não retornou uma imagem."
            );

        }


        /*
          Os modelos GPT Image retornam
          a imagem em base64.
        */
        if(image.b64_json){

            return res.json({

                success: true,

                image:
                    "data:image/png;base64," +
                    image.b64_json

            });

        }


        /*
          Compatibilidade caso algum modelo
          retorne URL.
        */
        if(image.url){

            return res.json({

                success: true,

                image:
                    image.url

            });

        }


        return sendError(
            res,
            502,
            "A API retornou dados de imagem em formato inesperado."
        );


    } catch(error){

        console.error(
            "[NovaAI] Erro ao gerar imagem:",
            error
        );


        return res.status(500).json({

            error:
                error?.message ||
                "Não foi possível gerar a imagem."

        });

    }

});


/* =====================================================
   EDITAR IMAGEM
===================================================== */

app.post("/api/image/edit", async (req, res) => {

    try {

        if(!OPENAI_API_KEY){

            return sendError(
                res,
                500,
                "OPENAI_API_KEY não está configurada no Render."
            );

        }


        const imageData =
            typeof req.body?.image === "string"
                ? req.body.image
                : "";


        const prompt =
            typeof req.body?.prompt === "string"
                ? req.body.prompt.trim()
                : "";


        if(!imageData){

            return sendError(
                res,
                400,
                "Nenhuma imagem foi enviada."
            );

        }


        if(!prompt){

            return sendError(
                res,
                400,
                "Descreva o que deseja alterar na imagem."
            );

        }


        /*
          Esperamos algo como:

          data:image/png;base64,AAAA...

          ou

          data:image/jpeg;base64,AAAA...
        */

        const match =
            imageData.match(
                /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i
            );


        if(!match){

            return sendError(
                res,
                400,
                "Formato de imagem inválido."
            );

        }


        const mimeType =
            match[1].toLowerCase();


        const base64 =
            match[2];


        const buffer =
            Buffer.from(
                base64,
                "base64"
            );


        if(!buffer.length){

            return sendError(
                res,
                400,
                "A imagem enviada está vazia."
            );

        }


        let extension = "png";


        if(mimeType.includes("jpeg") ||
           mimeType.includes("jpg")){

            extension = "jpg";

        }else if(
            mimeType.includes("webp")
        ){

            extension = "webp";

        }


        console.log(
            "[NovaAI] Editando imagem..."
        );


        const file =
            await toFile(
                buffer,
                `imagem.${extension}`,
                {
                    type: mimeType
                }
            );


        const result =
            await openai.images.edit({

                model:
                    process.env.IMAGE_MODEL ||
                    "gpt-image-1",

                image: file,

                prompt: prompt,

                size:
                    process.env.IMAGE_SIZE ||
                    "1024x1024",

                quality:
                    process.env.IMAGE_QUALITY ||
                    "medium",

                output_format: "png"

            });


        const image =
            result?.data?.[0];


        if(!image){

            return sendError(
                res,
                502,
                "A API não retornou a imagem editada."
            );

        }


        if(image.b64_json){

            return res.json({

                success: true,

                image:
                    "data:image/png;base64," +
                    image.b64_json

            });

        }


        if(image.url){

            return res.json({

                success: true,

                image:
                    image.url

            });

        }


        return sendError(
            res,
            502,
            "A API retornou um formato de imagem inesperado."
        );


    } catch(error){

        console.error(
            "[NovaAI] Erro ao editar imagem:",
            error
        );


        return res.status(500).json({

            error:
                error?.message ||
                "Não foi possível editar a imagem."

        });

    }

});


/* =====================================================
   TRATAMENTO DE ERRO
===================================================== */

app.use(
    (error, req, res, next) => {

        console.error(
            "[NovaAI] Erro geral:",
            error
        );


        if(res.headersSent){

            return next(error);

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
    () => {

        console.log(
            "======================================"
        );

        console.log(
            "NovaAI Backend iniciado"
        );

        console.log(
            "Porta:",
            PORT
        );

        console.log(
            "OPENAI_API_KEY:",
            OPENAI_API_KEY
                ? "CONFIGURADA"
                : "NÃO CONFIGURADA"
        );

        console.log(
            "Chat: /api/chat"
        );

        console.log(
            "Imagem: /api/image"
        );

        console.log(
            "Edição: /api/image/edit"
        );

        console.log(
            "======================================"
        );

    }
);
