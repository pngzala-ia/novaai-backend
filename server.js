const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const multer = require("multer");
const crypto = require("crypto");

dotenv.config();


/* =====================================================
   SERVIDOR
===================================================== */

const app = express();

const PORT =
    process.env.PORT || 3000;

const OPENAI_API_KEY =
    process.env.OPENAI_API_KEY;


if(!OPENAI_API_KEY){

    console.warn(
        "⚠️ OPENAI_API_KEY não configurada."
    );

}


const openai =
    new OpenAI({
        apiKey:
            OPENAI_API_KEY
    });


/* =====================================================
   CORS
===================================================== */

app.use(

    cors({

        origin:"*",

        methods:[
            "GET",
            "POST",
            "DELETE",
            "OPTIONS"
        ],

        allowedHeaders:[
            "Content-Type"
        ]

    })

);


/* =====================================================
   JSON
===================================================== */

app.use(

    express.json({

        limit:
            "12mb"

    })

);


/* =====================================================
   UPLOAD
===================================================== */

const upload =
    multer({

        storage:
            multer.memoryStorage(),

        limits:{

            fileSize:
                10 * 1024 * 1024

        },

        fileFilter:
            function(
                req,
                file,
                cb
            ){

                if(
                    file.mimetype &&
                    file.mimetype.startsWith(
                        "image/"
                    )
                ){

                    cb(
                        null,
                        true
                    );

                }else{

                    cb(
                        new Error(
                            "Envie somente uma imagem."
                        )
                    );

                }

            }

    });


/* =====================================================
   BANCO TEMPORÁRIO
===================================================== */

/*
   ATENÇÃO:

   Estes dados ficam na memória do servidor.

   Se o Render reiniciar o serviço,
   os posts poderão ser perdidos.

   Mais para frente podemos colocar
   banco de dados permanente.
*/

const posts = [];

const statuses = [];


/* =====================================================
   ID
===================================================== */

function createId(){

    return crypto.randomUUID();

}


/* =====================================================
   HORA
===================================================== */

function getTime(){

    return new Date().toLocaleTimeString(

        "pt-BR",

        {
            hour:"2-digit",
            minute:"2-digit"
        }

    );

}


/* =====================================================
   ITEM SOCIAL
===================================================== */

function createSocialItem(
    image,
    caption
){

    return {

        id:
            createId(),

        image:
            image,

        caption:
            caption || "",

        likes:
            0,

        liked:
            false,

        comments:
            [],

        createdAt:
            getTime()

    };

}


/* =====================================================
   PROCURAR ITEM
===================================================== */

function findItem(
    list,
    itemId
){

    return list.find(
        function(item){

            return item.id === itemId;

        }
    );

}


/* =====================================================
   VALIDAR IMAGEM
===================================================== */

function validImage(
    image
){

    return (

        typeof image === "string" &&

        image.startsWith(
            "data:image/"
        )

    );

}


/* =====================================================
   ROTA PRINCIPAL
===================================================== */

app.get(
    "/",
    function(req,res){

        res.json({

            status:
                "online",

            app:
                "NovaAI + GeraçãoZ",

            openai:
                !!OPENAI_API_KEY,

            social:
                true

        });

    }
);


/* =====================================================
   HEALTH
===================================================== */

app.get(
    "/api/health",
    function(req,res){

        res.json({

            ok:
                true,

            openai:
                !!OPENAI_API_KEY,

            social:
                true

        });

    }
);


/* =====================================================
   CHAT
===================================================== */

app.post(
    "/api/chat",
    async function(req,res){

        try{

            const message =

                typeof req.body.message === "string"

                    ? req.body.message.trim()

                    : "";


            if(!message){

                return res.status(400).json({

                    error:
                        "Digite uma mensagem."

                });

            }


            if(!OPENAI_API_KEY){

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
Você é a NovaAI,
assistente oficial da GeraçãoZ.

Responda em português do Brasil,
a menos que o usuário peça outro idioma.

Seja natural, útil, clara e objetiva.

Pedidos de geração ou edição de imagens
são tratados pelas rotas específicas
do servidor.
                        `,

                    input:
                        message

                });


            const answer =
                response.output_text;


            if(!answer){

                return res.status(502).json({

                    error:
                        "A API não retornou texto."

                });

            }


            return res.json({

                response:
                    answer,

                output_text:
                    answer

            });


        }catch(error){

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
    async function(req,res){

        try{

            const prompt =

                typeof req.body.prompt === "string"

                    ? req.body.prompt.trim()

                    : "";


            if(!prompt){

                return res.status(400).json({

                    error:
                        "Informe o que você quer criar."

                });

            }


            if(!OPENAI_API_KEY){

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

                    prompt:
                        prompt,

                    size:
                        "1024x1024"

                });


            const imageData =
                result?.data?.[0]?.b64_json;


            if(!imageData){

                throw new Error(
                    "A API não retornou os dados da imagem."
                );

            }


            const image =
                "data:image/png;base64," +
                imageData;


            console.log(
                "✅ Imagem criada."
            );


            return res.json({

                success:
                    true,

                image:
                    image,

                imageUrl:
                    image,

                url:
                    image

            });


        }catch(error){

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
    async function(req,res){

        try{

            if(!req.file){

                return res.status(400).json({

                    error:
                        "Nenhuma imagem foi enviada."

                });

            }


            if(!OPENAI_API_KEY){

                return res.status(500).json({

                    error:
                        "OPENAI_API_KEY não configurada no servidor."

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


            console.log(
                "✏️ Editando imagem:",
                prompt
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


            const imageData =
                result?.data?.[0]?.b64_json;


            if(!imageData){

                throw new Error(
                    "A API não retornou a imagem editada."
                );

            }


            const image =
                "data:image/png;base64," +
                imageData;


            console.log(
                "✅ Imagem editada."
            );


            return res.json({

                success:
                    true,

                image:
                    image,

                imageUrl:
                    image,

                url:
                    image

            });


        }catch(error){

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
   POSTS
===================================================== */

app.get(
    "/api/posts",
    function(req,res){

        res.json({

            success:
                true,

            posts:
                posts

        });

    }
);


/* =====================================================
   PUBLICAR POST
===================================================== */

app.post(
    "/api/posts",
    function(req,res){

        const image =
            req.body.image;


        const caption =

            typeof req.body.caption === "string"

                ? req.body.caption.trim()

                : "";


        if(!validImage(image)){

            return res.status(400).json({

                error:
                    "Nenhuma imagem válida foi enviada."

            });

        }


        const post =
            createSocialItem(
                image,
                caption
            );


        posts.unshift(
            post
        );


        console.log(
            "📤 Novo post:",
            post.id
        );


        return res.status(201).json({

            success:
                true,

            post:
                post

        });

    }
);


/* =====================================================
   APAGAR POST
===================================================== */

app.delete(
    "/api/posts/:id",
    function(req,res){

        const index =
            posts.findIndex(

                function(post){

                    return post.id ===
                        req.params.id;

                }

            );


        if(index < 0){

            return res.status(404).json({

                error:
                    "Publicação não encontrada."

            });

        }


        posts.splice(
            index,
            1
        );


        return res.json({

            success:
                true

        });

    }
);


/* =====================================================
   CURTIR POST
===================================================== */

app.post(
    "/api/posts/:id/like",
    function(req,res){

        const post =
            findItem(
                posts,
                req.params.id
            );


        if(!post){

            return res.status(404).json({

                error:
                    "Publicação não encontrada."

            });

        }


        post.liked =
            !post.liked;


        post.likes =
            Math.max(

                0,

                post.likes +
                (
                    post.liked
                        ? 1
                        : -1
                )

            );


        return res.json({

            success:
                true,

            liked:
                post.liked,

            likes:
                post.likes

        });

    }
);


/* =====================================================
   COMENTAR POST
===================================================== */

app.post(
    "/api/posts/:id/comments",
    function(req,res){

        const post =
            findItem(
                posts,
                req.params.id
            );


        const text =

            typeof req.body.text === "string"

                ? req.body.text.trim()

                : "";


        if(!post){

            return res.status(404).json({

                error:
                    "Publicação não encontrada."

            });

        }


        if(!text){

            return res.status(400).json({

                error:
                    "Digite um comentário."

            });

        }


        if(text.length > 500){

            return res.status(400).json({

                error:
                    "O comentário deve ter no máximo 500 caracteres."

            });

        }


        const comment = {

            id:
                createId(),

            name:
                "Você",

            text:
                text,

            createdAt:
                getTime()

        };


        post.comments.push(
            comment
        );


        return res.status(201).json({

            success:
                true,

            comment:
                comment

        });

    }
);


/* =====================================================
   STATUS
===================================================== */

app.get(
    "/api/status",
    function(req,res){

        res.json({

            success:
                true,

            statuses:
                statuses

        });

    }
);


/* =====================================================
   PUBLICAR STATUS
===================================================== */

app.post(
    "/api/status",
    function(req,res){

        const image =
            req.body.image;


        const caption =

            typeof req.body.caption === "string"

                ? req.body.caption.trim()

                : "";


        if(!validImage(image)){

            return res.status(400).json({

                error:
                    "Nenhuma imagem válida foi enviada."

            });

        }


        const status =
            createSocialItem(
                image,
                caption
            );


        statuses.unshift(
            status
        );


        console.log(
            "🟣 Novo status:",
            status.id
        );


        return res.status(201).json({

            success:
                true,

            status:
                status

        });

    }
);


/* =====================================================
   APAGAR STATUS
===================================================== */

app.delete(
    "/api/status/:id",
    function(req,res){

        const index =
            statuses.findIndex(

                function(status){

                    return status.id ===
                        req.params.id;

                }

            );


        if(index < 0){

            return res.status(404).json({

                error:
                    "Status não encontrado."

            });

        }


        statuses.splice(
            index,
            1
        );


        return res.json({

            success:
                true

        });

    }
);


/* =====================================================
   CURTIR STATUS
===================================================== */

app.post(
    "/api/status/:id/like",
    function(req,res){

        const status =
            findItem(
                statuses,
                req.params.id
            );


        if(!status){

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

                status.likes +
                (
                    status.liked
                        ? 1
                        : -1
                )

            );


        return res.json({

            success:
                true,

            liked:
                status.liked,

            likes:
                status.likes

        });

    }
);


/* =====================================================
   COMENTAR STATUS
===================================================== */

app.post(
    "/api/status/:id/comments",
    function(req,res){

        const status =
            findItem(
                statuses,
                req.params.id
            );


        const text =

            typeof req.body.text === "string"

                ? req.body.text.trim()

                : "";


        if(!status){

            return res.status(404).json({

                error:
                    "Status não encontrado."

            });

        }


        if(!text){

            return res.status(400).json({

                error:
                    "Digite um comentário."

            });

        }


        if(text.length > 500){

            return res.status(400).json({

                error:
                    "O comentário deve ter return (
                        item.id ===
                        req.params.id
                    );
                }
            );

        if (!status) {

            return res.status(404).json({
                error:
                    "Status não encontrado."
            });

        }

        status.liked =
            !status.liked;

        if (status.liked) {

            status.likes += 1;

        } else {

            status.likes =
                Math.max(
                    0,
                    status.likes - 1
                );

        }

        return res.json({
            success: true,
            liked: status.liked,
            likes: status.likes
        });

    }
);


/* =====================================================
   COMENTAR STATUS
===================================================== */

app.post(
    "/api/status/:id/comments",
    function(req, res) {

        const status =
            statuses.find(
                function(item) {
                    return (
                        item.id ===
                        req.params.id
                    );
                }
            );

        if (!status) {

            return res.status(404).json({
                error:
                    "Status não encontrado."
            });

        }

        const text =
            cleanText(
                req.body.text
            );

        if (!text) {

            return res.status(400).json({
                error:
                    "Digite um comentário."
            });

        }

        const comment = {

            id:
                createId("comment"),

            user:
                {
                    id:
                        DEFAULT_USER.id,

                    name:
                        DEFAULT_USER.name
                },

            text:
                text,

            createdAt:
                now()

        };

        status.comments.push(
            comment
        );

        return res.status(201).json({
            success: true,
            comment: comment
        });

    }
);


/* =====================================================
   APAGAR COMENTÁRIO DO STATUS
===================================================== */

app.delete(
    "/api/status/:statusId/comments/:commentId",
    function(req, res) {

        const status =
            statuses.find(
                function(item) {
                    return (
                        item.id ===
                        req.params.statusId
                    );
                }
            );

        if (!status) {

            return res.status(404).json({
                error:
                    "Status não encontrado."
            });

        }

        const index =
            status.comments.findIndex(
                function(comment) {
                    return (
                        comment.id ===
                        req.params.commentId
                    );
                }
            );

        if (index === -1) {

            return res.status(404).json({
                error:
                    "Comentário não encontrado."
            });

        }

        status.comments.splice(
            index,
            1
        );

        return res.json({
            success: true
        });

    }
);


/* =====================================================
   ERRO DE UPLOAD
===================================================== */

app.use(
    function(error, req, res, next) {

        console.error(
            "ERRO DO SERVIDOR:",
            error
        );

        if (
            error &&
            error.code ===
                "LIMIT_FILE_SIZE"
        ) {

            return res.status(413).json({
                error:
                    "A imagem é muito grande. Limite: 10 MB."
            });

        }

        return res.status(500).json({
            error:
                error &&
                error.message
                    ? error.message
                    : "Erro interno do servidor."
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
            "NovaAI + GeraçãoZ online"
        );

        console.log(
            "Porta:",
            PORT
        );

        console.log(
            "OpenAI:",
            OPENAI_API_KEY
                ? "CONFIGURADA"
                : "NAO CONFIGURADA"
        );

        console.log(
            "================================="
        );

    }
);
