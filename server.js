const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const multer = require("multer");
const crypto = require("crypto");

dotenv.config();

const app = express();

const PORT =
    process.env.PORT || 3000;

const OPENAI_API_KEY =
    process.env.OPENAI_API_KEY;


/* =====================================================
   OPENAI
===================================================== */

const openai =
    OPENAI_API_KEY
        ? new OpenAI({
            apiKey: OPENAI_API_KEY
        })
        : null;


if(!OPENAI_API_KEY){

    console.warn(
        "⚠️ OPENAI_API_KEY não configurada."
    );

}


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
            "Content-Type",
            "Authorization"
        ]
    })
);


/* =====================================================
   JSON
===================================================== */

app.use(
    express.json({
        limit:"15mb"
    })
);


/* =====================================================
   UPLOAD DE IMAGEM
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
            function(req,file,callback){

                if(
                    file.mimetype &&
                    file.mimetype.startsWith(
                        "image/"
                    )
                ){

                    callback(
                        null,
                        true
                    );

                }else{

                    callback(
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
   Atenção:

   Este exemplo usa memória RAM.

   Se o Render reiniciar o serviço,
   os posts/status podem ser perdidos.

   Depois podemos trocar por banco
   de dados permanente.
*/

const posts = [];

const statuses = [];


/* =====================================================
   FUNÇÕES AUXILIARES
===================================================== */

function id(){

    return crypto.randomUUID();

}


function nowISO(){

    return new Date().toISOString();

}


function timeNow(){

    return new Date().toLocaleTimeString(
        "pt-BR",
        {
            hour:"2-digit",
            minute:"2-digit"
        }
    );

}


function validImage(image){

    return (
        typeof image === "string" &&
        image.startsWith(
            "data:image/"
        )
    );

}


function userData(body){

    return {

        userId:
            typeof body.userId === "string" &&
            body.userId.trim()
                ? body.userId.trim()
                : "you",

        userName:
            typeof body.userName === "string" &&
            body.userName.trim()
                ? body.userName.trim()
                : "Você",

        username:
            typeof body.username === "string" &&
            body.username.trim()
                ? body.username.trim()
                : "@voce"

    };

}


function findPost(postId){

    return posts.find(
        post =>
            post.id === postId
    );

}


function findStory(storyId){

    return statuses.find(
        story =>
            story.id === storyId
    );

}


function cleanExpiredStatuses(){

    const now =
        Date.now();

    for(
        let i =
            statuses.length - 1;
        i >= 0;
        i--
    ){

        const story =
            statuses[i];

        if(
            new Date(
                story.expiresAt
            ).getTime() <= now
        ){

            statuses.splice(
                i,
                1
            );

        }

    }

}


/* =====================================================
   COMENTÁRIO
===================================================== */

function createComment(
    body,
    text
){

    const user =
        userData(body);

    return {

        id:id(),

        userId:
            user.userId,

        name:
            user.userName,

        username:
            user.username,

        text,

        likes:0,

        likedBy:[],

        replies:[],

        createdAt:
            timeNow()

    };

}


function toggleLike(
    object,
    userId
){

    if(
        !Array.isArray(
            object.likedBy
        )
    ){

        object.likedBy = [];

    }


    const index =
        object.likedBy.indexOf(
            userId
        );


    if(index >= 0){

        object.likedBy.splice(
            index,
            1
        );

    }else{

        object.likedBy.push(
            userId
        );

    }


    object.likes =
        object.likedBy.length;


    return index < 0;

}


function serializeComment(
    comment,
    userId
){

    return {

        id:
            comment.id,

        userId:
            comment.userId,

        name:
            comment.name,

        username:
            comment.username,

        text:
            comment.text,

        likes:
            comment.likes || 0,

        liked:
            Array.isArray(
                comment.likedBy
            ) &&
            comment.likedBy.includes(
                userId
            ),

        replies:
            (
                comment.replies ||
                []
            ).map(
                reply =>
                    serializeComment(
                        reply,
                        userId
                    )
            ),

        createdAt:
            comment.createdAt

    };

}


/* =====================================================
   SERIALIZAR POST
===================================================== */

function serializePost(
    post,
    userId
){

    return {

        id:
            post.id,

        userId:
            post.userId,

        userName:
            post.userName,

        username:
            post.username,

        image:
            post.image,

        caption:
            post.caption,

        archived:
            !!post.archived,

        likes:
            post.likes || 0,

        liked:
            Array.isArray(
                post.likedBy
            ) &&
            post.likedBy.includes(
                userId
            ),

        comments:
            (
                post.comments ||
                []
            ).map(
                comment =>
                    serializeComment(
                        comment,
                        userId
                    )
            ),

        createdAt:
            post.createdAt

    };

}


/* =====================================================
   SERIALIZAR STATUS
===================================================== */

function serializeStatus(
    story,
    userId
){

    return {

        id:
            story.id,

        userId:
            story.userId,

        userName:
            story.userName,

        username:
            story.username,

        createdAt:
            story.createdAt,

        expiresAt:
            story.expiresAt,

        slides:
            story.slides.map(
                slide => ({

                    id:
                        slide.id,

                    image:
                        slide.image,

                    caption:
                        slide.caption,

                    likes:
                        slide.likes || 0,

                    liked:
                        Array.isArray(
                            slide.likedBy
                        ) &&
                        slide.likedBy.includes(
                            userId
                        ),

                    comments:
                        (
                            slide.comments ||
                            []
                        ).map(
                            comment =>
                                serializeComment(
                                    comment,
                                    userId
                                )
                        ),

                    createdAt:
                        slide.createdAt

                })
            )

    };

}


/* =====================================================
   TESTE
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

            feed:
                true,

            status:
                true,

            comments:
                true,

            replies:
                true

        });

    }
);


app.get(
    "/api/health",
    function(req,res){

        res.json({

            ok:true,

            service:
                "NovaAI + GeraçãoZ",

            openai:
                !!OPENAI_API_KEY

        });

    }
);


/* =====================================================
   CHAT NOVAAI
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


            if(!openai){

                return res.status(500).json({

                    error:
                        "OPENAI_API_KEY não configurada no Render."

                });

            }


            const response =
                await openai.responses.create({

                    model:
                        "gpt-5.6-luna",

                    instructions:
                        "Você é a NovaAI da GeraçãoZ. Responda em português do Brasil de forma natural, útil e clara.",

                    input:
                        message

                });


            const answer =
                response.output_text ||
                "";


            if(!answer){

                return res.status(502).json({

                    error:
                        "A NovaAI não retornou texto."

                });

            }


            return res.json({

                success:true,

                response:
                    answer,

                output_text:
                    answer,

                reply:
                    answer

            });


        }catch(error){

            console.error(
                "ERRO /api/chat:",
                error
            );


            return res.status(
                error?.status || 500
            ).json({

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


            if(!openai){

                return res.status(500).json({

                    error:
                        "OPENAI_API_KEY não configurada."

                });

            }


            const result =
                await openai.images.generate({

                    model:
                        "gpt-image-2",

                    prompt:
                        prompt,

                    size:
                        "1024x1024"

                });


            const base64 =
                result?.data?.[0]?.b64_json;


            if(!base64){

                throw new Error(
                    "A API não retornou a imagem."
                );

            }


            const image =
                "data:image/png;base64," +
                base64;


            return res.json({

                success:true,

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
                    "Não foi possível criar a imagem."

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


            if(!openai){

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

                    prompt:
                        prompt,

                    size:
                        "1024x1024"

                });


            const base64 =
                result?.data?.[0]?.b64_json;


            if(!base64){

                throw new Error(
                    "A API não retornou a imagem editada."
                );

            }


            const image =
                "data:image/png;base64," +
                base64;


            return res.json({

                success:true,

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
   FEED - LISTAR
===================================================== */

app.get(
    "/api/posts",
    function(req,res){

        const userId =
            typeof req.query.userId === "string"
                ? req.query.userId
                : "you";


        const includeArchived =
            req.query.includeArchived === "true";


        const result =
            posts
                .filter(
                    post =>
                        includeArchived ||
                        !post.archived
                )
                .map(
                    post =>
                        serializePost(
                            post,
                            userId
                        )
                );


        res.json({

            success:true,

            posts:
                result

        });

    }
);


/* =====================================================
   CRIAR POST
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


        const user =
            userData(
                req.body
            );


        const post = {

            id:
                id(),

            userId:
                user.userId,

            userName:
                user.userName,

            username:
                user.username,

            image:
                image,

            caption:
                caption,

            archived:
                false,

            likes:
                0,

            likedBy:
                [],

            comments:
                [],

            createdAt:
                timeNow(),

            createdAtISO:
                nowISO()

        };


        posts.unshift(
            post
        );


        return res.status(201).json({

            success:true,

            post:
                serializePost(
                    post,
                    user.userId
                )

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
            findPost(
                req.params.id
            );


        if(!post){

            return res.status(404).json({

                error:
                    "Publicação não encontrada."

            });

        }


        const user =
            userData(
                req.body || {}
            );


        const liked =
            toggleLike(
                post,
                user.userId
            );


        res.json({

            success:true,

            liked:

                liked,

            likes:
                post.likes

        });

    }
);


/* =====================================================
   ARQUIVAR POST
===================================================== */

app.post(
    "/api/posts/:id/archive",
    function(req,res){

        const post =
            findPost(
                req.params.id
            );


        if(!post){

            return res.status(404).json({

                error:
                    "Publicação não encontrada."

            });

        }


        const user =
            userData(
                req.body || {}
            );


        if(
            post.userId !==
            user.userId
        ){

            return res.status(403).json({

                error:
                    "Você só pode arquivar suas próprias fotos."

            });

        
        }


        post.archived =
            !post.archived;


        res.json({

            success:true,

            archived:
                post.archived

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
                post =>
                    post.id ===
                    req.params.id
            );


        if(index < 0){

            return res.status(404).json({

                error:
                    "Publicação não encontrada."

            });

        }


        const user =
            userData(
                req.body || {}
            );


        if(
            posts[index].userId !==
            user.userId
        ){

            return res.status(403).json({

                error:
                    "Você só pode apagar suas próprias fotos."

            });

        }


        posts.splice(
            index,
            1
        );


        res.json({

            success:true

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
            findPost(
                req.params.id
            );


        if(!post){

            return res.status(404).json({

                error:
                    "Publicação não encontrada."

            });

        }


        const text =
            typeof req.body.text === "string"
                ? req.body.text.trim()
                : "";


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


        const comment =
            createComment(
                req.body,
                text
            );


        post.comments.push(
            comment
        );


        res.status(201).json({

            success:true,

            comment:
                serializeComment(
                    comment,
                    comment.userId
                )

        });

    }
);


/* =====================================================
   CURTIR COMENTÁRIO
===================================================== */

app.post(
    "/api/posts/:postId/comments/:commentId/like",
    function(req,res){

        const post =
            findPost(
                req.params.postId
            );


        if(!post){

            return res.status(404).json({

                error:
                    "Publicação não encontrada."

            });

        }


        const comment =
            post.comments.find(
                item =>
                    item.id ===
                    req.params.commentId
            );


        if(!comment){

            return res.status(404).json({

                error:
                    "Comentário não encontrado."

            });

        }


        const user =
            userData(
                req.body || {}
            );


        const liked =
            toggleLike(
                comment,
                user.userId
            );


        res.json({

            success:true,

            liked,

            likes:
                comment.likes

        });

    }
);


/* =====================================================
   RESPONDER COMENTÁRIO
===================================================== */

app.post(
    "/api/posts/:postId/comments/:commentId/replies",
    function(req,res){

        const post =
            findPost(
                req.params.postId
            );


        if(!post){

            return res.status(404).json({

                error:
                    "Publicação não encontrada."

            });

        }


        const comment =
            post.comments.find(
                item =>
                    item.id ===
                    req.params.commentId
            );


        if(!comment){

            return res.status(404).json({

                error:
                    "Comentário não encontrado."

            });

        }


        const text =
            typeof req.body.text === "string"
                ? req.body.text.trim()
                : "";


        if(!text){

            return res.status(400).json({

                error:
                    "Digite uma resposta."

            });

        }


        const reply =
            createComment(
                req.body,
                text
            );


        comment.replies.push(
            reply
        );


        res.status(201).json({

            success:true,

            reply:
                serializeComment(
                    reply,
                    reply.userId
                )

        });

    }
);


/* =====================================================
   CURTIR RESPOSTA
===================================================== */

app.post(
    "/api/posts/:postId/comments/:commentId/replies/:replyId/like",
    function(req,res){

        const post =
            findPost(
                req.params.postId
            );


        if(!post){

            return res.status(404).json({

                error:
                    "Publicação não encontrada."

            });

        }


        const comment =
            post.comments.find(
                item =>
                    item.id ===
                    req.params.commentId
            );


        if(!comment){

            return res.status(404).json({

                error:
                    "Comentário não encontrado."

            });

        }


        const reply =
            comment.replies.find(
                item =>
                    item.id ===
                    req.params.replyId
            );


        if(!reply){

            return res.status(404).json({

                error:
                    "Resposta não encontrada."

            });

        }


        const user =
            userData(
                req.body || {}
            );


        const liked =
            toggleLike(
                reply,
                user.userId
            );


        res.json({

            success:true,

            liked,

            likes:
                reply.likes

        });

    }
);


/* =====================================================
   STATUS - LISTAR
===================================================== */

app.get(
    "/api/status",
    function(req,res){

        cleanExpiredStatuses();


        const userId =
            typeof req.query.userId === "string"
                ? req.query.userId
                : "you";


        res.json({

            success:true,

            statuses:
                statuses.map(
                    story =>
                        serializeStatus(
                            story,
                            userId
                        )
                )

        });

    }
);


/* =====================================================
   STATUS - CRIAR / ADICIONAR FOTO
===================================================== */

app.post(
    "/api/status",
    function(req,res){

        cleanExpiredStatuses();


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


        const user =
            userData(
                req.body
            );


        let story =
            statuses.find(
                item =>
                    item.userId ===
                    user.userId
            );


        /*
           O prazo de 24 horas começa
           na primeira foto do status.

           Adicionar outra foto não
           reinicia o relógio.
        */

        if(!story){

            const created =
                new Date();

            const expires =
                new Date(
                    created.getTime() +
                    24 * 60 * 60 * 1000
                );


            story = {

                id:
                    id(),

                userId:
                    user.userId,

                userName:
                    user.userName,

                username:
                    user.username,

                createdAt:
                    created.toISOString(),

                expiresAt:
                    expires.toISOString(),

                slides:
                    []

            };


            statuses.unshift(
                story
            );

        }


        const slide = {

            id:
                id(),

            image:
                image,

            caption:
                caption,

            likes:
                0,

            likedBy:
                [],

            comments:
                [],

            createdAt:
                timeNow()

        };


        story.slides.push(
            slide
        );


        res.status(201).json({

            success:true,

            status:
                serializeStatus(
                    story,
                    user.userId
                )

        });

    }
);


/* =====================================================
   CURTIR FOTO DO STATUS
===================================================== */

app.post(
    "/api/status/:storyId/:slideId/like",
    function(req,res){

        cleanExpiredStatuses();


        const story =
            findStory(
                req.params.storyId
            );


        if(!story){

            return res.status(404).json({

                error:
                    "Status não encontrado."

            });

        }


        const slide =
            story.slides.find(
                item =>
                    item.id ===
                    req.params.slideId
            );


        if(!slide){

            return res.status(404).json({

                error:
                    "Foto do status não encontrada."

            });

        }


        const user =
            userData(
                req.body || {}
            );


        const liked =
            toggleLike(
                slide,
                user.userId
            );


        res.json({

            success:true,

            liked,

            likes:
                slide.likes

        });

    }
);


/* =====================================================
   STATUS - COMENTAR
===================================================== */

app.post(
    "/api/status/:storyId/:slideId/comments",
    function(req,res){

        cleanExpiredStatuses();


        const story =
            findStory(
                req.params.storyId
            );


        if(!story){

            return res.status(404).json({

                error:
                    "Status não encontrado."

            });

        }


        const slide =
            story.slides.find(
                item =>
                    item.id ===
                    req.params.slideId
            );


        if(!slide){

            return res.status(404).json({

                error:
                    "Foto do status não encontrada."

            });

        }


        const text =
            typeof req.body.text === "string"
                ? req.body.text.trim()
                : "";


        if(!text){

            return res.status(400).json({

                error:
                    "Digite um comentário."

            });

        }


        const comment =
            createComment(
                req.body,
                text
            );


        slide.comments.push(
            comment
        );


        res.status(201).json({

            success:true,

            comment:
                serializeComment(
                    comment,
                    comment.userId
                )

        });

    }
);


/* =====================================================
   ERROS
===================================================== */

app.use(
    function(error,req,res,next){

        console.error(
            "ERRO DO SERVIDOR:",
            error
        );


        if(
            error?.code ===
            "LIMIT_FILE_SIZE"
        ){

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
   INICIAR
===================================================== */

app.listen(
    PORT,
    function(){

        console.log(
            "================================="
        );

        console.log(
            "🚀 NovaAI + GeraçãoZ ONLINE"
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
            "Feed: ATIVO"
        );

        console.log(
            "Status 24h: ATIVO"
        );

        console.log(
            "Fotos por status: ATIVO"
        );

        console.log(
            "Comentários: ATIVOS"
        );

        console.log(
            "Respostas: ATIVAS"
        );

        console.log(
            "Curtidas: ATIVAS"
        );

        console.log(
            "Arquivamento: ATIVO"
        );

        console.log(
            "================================="
        );

    }
);
