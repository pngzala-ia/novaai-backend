const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();

/*
==================================================
CORS
==================================================
Permite que o index.html do TrebEdit, inclusive
quando aberto como file://, consiga acessar a API.
*/

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

/*
Garante resposta às requisições OPTIONS
usadas pelo navegador antes do POST.
*/
app.options("*", cors());


/*
==================================================
MIDDLEWARE
==================================================
*/

app.use(express.json({
    limit: "10mb"
}));


/*
==================================================
OPENAI
==================================================
*/

const apiKey =
    process.env.OPENAI_API_KEY;

const client =
    new OpenAI({
        apiKey: apiKey
    });


/*
==================================================
ROTA PRINCIPAL
==================================================
*/

app.get("/", (req, res) => {

    res.json({
        status: "online",
        novaai: "NovaAI da GeraçãoZ",
        openai_configurada: !!apiKey
    });

});


/*
==================================================
CHAT DA NOVAAI
==================================================
*/

app.post("/api/chat", async (req, res) => {

    try {

        const message =
            req.body.message;

        const image =
            req.body.image || null;


        if(
            !message &&
            !image
        ){

            return res.status(400).json({
                error: "Mensagem vazia."
            });

        }


        /*
        ------------------------------------------
        MENSAGEM PARA A NOVAAI
        ------------------------------------------
        */

        let input = [];


        if(message){

            input.push({
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: message
                    }
                ]
            });

        }


        /*
        ------------------------------------------
        IMAGEM ENVIADA PELO USUÁRIO
        ------------------------------------------
        */

        if(image){

            /*
            Se existir uma mensagem junto com a
            imagem, adicionamos a imagem ao mesmo
            conteúdo.
            */

            if(
                input.length > 0
            ){

                input[0].content.push({
                    type: "input_image",
                    image_url: image
                });

            }else{

                input.push({
                    role: "user",
                    content: [
                        {
                            type: "input_image",
                            image_url: image
                        }
                    ]
                });

            }

        }


        /*
        ------------------------------------------
        CHAMADA DA OPENAI
        ------------------------------------------
        */

        const response =
            await client.responses.create({

                model: "gpt-5-mini",

                input: input

            });


        /*
        ------------------------------------------
        RESPOSTA
        ------------------------------------------
        */

        const outputText =
            response.output_text ||
            "Não consegui gerar uma resposta.";


        return res.json({

            success: true,

            reply: outputText

        });


    } catch(error) {

        console.error(
            "ERRO NOVAAI:",
            error
        );


        return res.status(500).json({

            success: false,

            error:
                error.message ||
                "Erro interno no servidor."

        });

    }

});


/*
==================================================
ERRO 404
==================================================
*/

app.use((req, res) => {

    res.status(404).json({

        error: "Rota não encontrada."

    });

});


/*
==================================================
PORTA
==================================================
*/

const PORT =
    process.env.PORT || 3000;


app.listen(
    PORT,
    () => {

        console.log(
            `NovaAI online na porta ${PORT}`
        );

        console.log(
            "OPENAI_API_KEY configurada:",
            !!apiKey
        );

    }
);
