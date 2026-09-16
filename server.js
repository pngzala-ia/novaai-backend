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
        methods: [
            "GET",
            "POST",
            "DELETE",
            "OPTIONS"
        ],
        allowedHeaders: [
            "Content-Type"
        ]
    })
);


app.use(
    express.json({
        limit: "12mb"
    })
);


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
        function(req, file, cb) {

            if (
                file.mimetype &&
                file.mimetype.startsWith("image/")
            ) {

                cb(
                    null,
                    true
                );

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
   BANCO TEMPORÁRIO
===================================================== */

let posts = [];

let statuses = [];

let nextPostId = 1;

let nextStatusId = 1;

let nextCommentId = 1;


/* =====================================================
   FUNÇÕES AUXILIARES
===================================================== */

function cleanText(value, max = 500) {

    if (
        typeof value !== "string"
    ) {

        return "";

    }

    return value
        .trim()
        .slice(0, max);

}


function cleanUserId(value) {

    const userId =
        cleanText(
            value,
            100
        );

    return userId ||
        "usuario-local";

}


function isImageData(value) {

    if (
        typeof value !== "string"
    ) {

        return false;

    }

    return (
        value.startsWith(
            "data:image/"
        ) ||
        /^https?:\/\//i.test(
            value
        )
    );

}


function createComment(
    userId,
    text
) {

    return {

        id:
            nextCommentId++,

        userId:
            cleanUserId(
                userId
            ),

        name:
            "Você",

        text:
            cleanText(
                text,
                500
            ),

        createdAt:
            new Date().toISOString()

    };

}


function preparePost(
    post,
    currentUserId
) {

    return {

        id:
            post.id,

        userId:
            post.userId,

        name:
            post.name,

        image:
            post.image,

        caption:
            post.caption,

        likes:
            post.likes.length,

        liked:
            post.likes.includes(
                currentUserId
            ),

        comments:
            post.comments,

        createdAt:
            post.createdAt

    };

}


function prepareStatus(
    status,
    currentUserId
) {

    return {

        id:
            status.id,

        userId:
            status.userId,

        name:
            status.name,

        image:
            status.image,

        caption:
            status.caption,

        likes:
            status.likes.length,

        liked:
            status.likes.includes(
                currentUserId
            ),

        comments:
            status.comments,

        createdAt:
            status.createdAt

    };

}


/* =====================================================
   ROTA PRINCIPAL
===================================================== */

app.get(
    "/",
    function(req, res) {

        res.json({

            status:
                "online",

            app:
                "NovaAI + GeraçãoZ",

            openai:
                !!OPENAI_API_KEY,

            posts:
                posts.length,

            statuses:
                statuses.length

        });

    }
);


/* =====================================================
   HEALTH CHECK
===================================================== */

app.get(
    "/api/health",
    function(req, res) {

        res.json({

            ok:
                true,

            openai:
                !!OPENAI_API_KEY,

            posts:
                posts.length,

            statuses:
                statuses.length

        });

    }
);


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
Você é a NovaAI, assistente oficial da GeraçãoZ.

Responda em português do Brasil,
a menos que o usuário peça outro idioma.

Seja natural, útil e objetiva.

Pedidos de geração e edição de imagens
são tratados pelas rotas específicas
do servidor.
                        `,

                    input:
                        message

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

                success:
                    true,

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

                success:
                    true,

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
   CRIAR POST
===================================================== */

app.post(
    "/api/posts",
    function(req, res) {

        try {

            const userId =
                cleanUserId(
                    req.body.userId
                );

            const image =
                req.body.image;

            const caption =
                cleanText(
                    req.body.caption,
                    500
                );


            if (!isImageData(image)) {

                return res.status(400).json({

                    error:
                        "Imagem inválida."

                });

            }


            const post = {

                id:
                    nextPostId++,

                userId:
                    userId,

                name:
                    "Você",

                image:
                    image,

                caption:
                    caption,

                likes:
                    [],

                comments:
                    [],

                createdAt:
                    new Date().toISOString()

            };


            posts.unshift(
                post
            );


            return res.status(201).json({

                success:
                    true,

                post:
                    preparePost(
                        post,
                        userId
                    )

            });


        } catch (error) {

            console.error(
                "ERRO CRIANDO POST:",
                error
            );


            return res.status(500).json({

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
    function(req, res) {

        const userId =
            cleanUserId(
                req.query.userId
            );


        return res.json({

            success:
                true,

            posts:
                posts.map(
                    function(post) {

                        return preparePost(
                            post,
                            userId
                        );

                    }
                )

        });

    }
);


/* =====================================================
   APAGAR POST
===================================================== */

app.delete(
    "/api/posts/:id",
    function(req, res) {

        const id =
            Number(
                req.params.id
            );

        const userId =
            cleanUserId(
                req.query.userId ||
                req.body?.userId
            );


        const index =
            posts.findIndex(
                function(post) {

                    return post.id === id;

                }
            );


        if (index === -1) {

            return res.status(404).json({

                error:
                    "Publicação não encontrada."

            });

        }


        if (
            posts[index].userId !==
            userId
        ) {

            return res.status(403).json({

                error:
                    "Você só pode apagar suas próprias publicações."

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
    function(req, res) {

        const id =
            Number(
                req.params.id
            );

        const userId =
            cleanUserId(
                req.body.userId
            );


        const post =
            posts.find(
                function(item) {

                    return item.id === id;

                }
            );


        if (!post) {

            return res.status(404).json({

                error:
                    "Publicação não encontrada."

            });

        }


        const index =
            post.likes.indexOf(
                userId
            );


        let liked;


        if (index >= 0) {

            post.likes.splice(
                index,
                1
            );

            liked = false;

        } else {

            post.likes.push(
                userId
            );

            liked = true;

        }


        return res.json({

            success:
                true,

            liked:
                liked,

            likes:
                post.likes.length

        });

    }
);


/* =====================================================
   COMENTAR POST
===================================================== */

app.post(
    "/api/posts/:id/comments",
    function(req, res) {

        const id =
            Number(
                req.params.id
            );

        const userId =
            cleanUserId(
                req.body.userId
            );

        const text =
            cleanText(
                req.body.text,
                500
            );


        if (!text) {

            return res.status(400).json({

                error:
                    "Digite um comentário."

            });

        }


        const post =
            posts.find(
                function(item) {

                    return item.id === id;

                }
            );


        if (!post) {

            return res.status(404).json({

                error:
                    "Publicação não encontrada."

            });

        }


        const comment =
            createComment(
                userId,
                text
            );


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
   CRIAR STATUS
===================================================== */

app.post(
    "/api/statuses",
    function(req, res) {

        try {

            const userId =
                cleanUserId(
                    req.body.userId
                );

            const image =
                req.body.image;

            const caption =
                cleanText(
                    req.body.caption,
                    300
                );


            if (!isImageData(image)) {

                return res.status(400).json({

                    error:
                        "Imagem inválida."

                });

            }


            const status = {

                id:
                    nextStatusId++,

                userId:
                    userId,

                name:
                    "Você",

                image:
                    image,

                caption:
                    caption,

                likes:
                    [],

                comments:
                    [],

                createdAt:
                    new Date().toISOString()

            };


            statuses.unshift(
                status
            );


            return res.status(201).json({

                success:
                    true,

                status:
                 
