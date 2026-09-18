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
    process.env.OPENAI_API_KEY || "";


/* ================================
   OPENAI
================================ */

if (!OPENAI_API_KEY) {
    console.warn(
        "OPENAI_API_KEY não configurada."
    );
}

const openai =
    new OpenAI({
        apiKey: OPENAI_API_KEY
    });


/* ================================
   CORS
================================ */

const corsOptions = {
    origin: "*",

    methods: [
        "GET",
        "POST",
        "DELETE",
        "OPTIONS"
    ],

    allowedHeaders: [
        "Content-Type",
        "Authorization"
    ],

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
    function(req, res, next) {

        res.header(
            "Access-Control-Allow-Origin",
            "*"
        );

        res.header(
            "Access-Control-Allow-Methods",
            "GET,POST,DELETE,OPTIONS"
        );

        res.header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization"
        );

        if (req.method === "OPTIONS") {
            return res.sendStatus(204);
        }

        next();
    }
);


/* ================================
   JSON
================================ */

app.use(
    express.json({
        limit: "20mb"
    })
);


/* ================================
   BANCO TEMPORÁRIO
================================ */

const posts = [];
const statuses = [];


/* ================================
   USUÁRIO
================================ */

const DEFAULT_USER = {
    id: "user-local",
    name: "Você",
    username: "@voce"
};


/* ================================
   FUNÇÕES
================================ */

function createId(prefix) {

    return (
        prefix +
        "-" +
        crypto.randomUUID()
    );

}

function now() {

    return new Date().toISOString();

}

function cleanText(
    value,
    fallback = ""
) {

    if (
        typeof value !== "string"
    ) {
        return fallback;
    }

    return value.trim();

}


/* ================================
   UPLOAD
================================ */

const upload =
    multer({

        storage:
            multer.memoryStorage(),

        limits: {
            fileSize:
                10 * 1024 * 1024
        },

        fileFilter:
            function(
                req,
                file,
                cb
            ) {

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


/* ================================
   ROTA PRINCIPAL
================================ */

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


/* ================================
   HEALTH
================================ */

app.get(
    "/api/health",
    function(req, res) {

        res.json({

            ok: true,

            app:
                "NovaAI + GeraçãoZ",

            openai:
                !!OPENAI_API_KEY

        });

    }
);


/* ================================
   CHAT NOVAAI
================================ */

app.post(
    "/api/chat",
    async function(req, res) {

        try {

            const message =
                cleanText(
                    req.body &&
                    req.body.message
                );

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


            /* ================================
               HISTÓRICO DA CONVERSA
            ================================= */

            const rawHistory =
                Array.isArray(
                    req.body &&
                    req.body.history
                )
                    ? req.body.history.slice(-20)
                    : [];


            const history =
                rawHistory
                    .filter(
                        function(item) {

                            return (
                                item &&
                                (
                                    item.role === "user" ||
                                    item.role === "assistant"
                                ) &&
                                typeof item.content === "string" &&
                                item.content.trim()
                            );

                        }
                    )
                    .map(
                        function(item) {

                            return {

                                role:
                                    item.role,

                                content:
                                    item.content.trim()

                            };

                        }
                    );


            /* ================================
               CONTEXTO DA NOVAAI
            ================================= */

            const projectContext = `
Você é a NovaAI, a assistente oficial da GeraçãoZ.

Você está integrada ao aplicativo GeraçãoZ e deve manter
continuidade durante a conversa.

REGRAS DE CONVERSA:

- Responda em português do Brasil, salvo se o usuário pedir
  outro idioma.

- Considere o histórico recente antes de responder.

- Não trate cada mensagem como uma conversa completamente nova.

- Quando o usuário disser "isso", "aquilo", "essa parte",
  "aquela parte", "o anterior", "a versão anterior",
  "o código que fizemos", "continue", "altere isso" ou
  expressões semelhantes, use o histórico para descobrir
  do que ele está falando.

- Se o contexto permitir entender a referência, não peça
  novamente uma informação que já foi explicada.

- Se existirem duas interpretações realmente diferentes
  e o histórico não permitir descobrir qual é a correta,
  faça uma pergunta curta para esclarecer.

- Quando o usuário estiver trabalhando no código da GeraçãoZ
  ou da NovaAI, preserve o que já funciona.

- Não invente funcionalidades ou alterações que o usuário
  não pediu.

- Se o usuário pedir uma alteração específica, concentre-se
  nessa alteração sem modificar partes não relacionadas.

- Se o usuário corrigir alguma informação, considere a
  correção nas mensagens seguintes da conversa.

- Seja natural, clara, objetiva e útil.

- Não diga que esqueceu algo que está disponível no histórico.

- Quando o usuário estiver continuando um assunto anterior,
  trate a conversa como uma continuidade.
`;


            /* ================================
               TRANSFORMAR HISTÓRICO EM CONTEXTO
            ================================= */

            let conversationContext = "";

            if (history.length > 0) {

                conversationContext =
                    "\nHISTÓRICO RECENTE DA CONVERSA:\n";

                history.forEach(
                    function(item) {

                        const speaker =
                            item.role === "user"
                                ? "Usuário"
                                : "NovaAI";

                        conversationContext +=
                            speaker +
                            ": " +
                            item.content +
                            "\n";

                    }
                );

            } else {

                conversationContext =
                    "\nHISTÓRICO RECENTE: nenhuma mensagem anterior disponível.\n";

            }


            /* ================================
               ENVIAR PARA OPENAI
            ================================= */

            console.log(
                "NovaAI recebeu:",
                message
            );

            const response =
                await openai.responses.create({

                    model:
                        "gpt-5.6-luna",

                    instructions:
                        projectContext,

                    input:
                        conversationContext +
                        "\nMENSAGEM ATUAL DO USUÁRIO:\n" +
                        message

                });


            const answer =
                response.output_text || "";


            if (!answer) {

                return res.status(502).json({

                    error:
                        "A API não retornou texto."

                });

            }


            console.log(
                "NovaAI respondeu com sucesso."
            );


            return res.json({

                success: true,

                response:
                    answer,

                output_text:
                    answer,

                reply:
                    answer

            });


        } catch (error) {

            console.error(
                "ERRO /api/chat:",
                error
            );


            return res.status(
                error &&
                error.status
                    ? error.status
                    : 500
            ).json({

                error:
                    error &&
                    error.message
                        ? error.message
                        : "Erro ao conversar com a NovaAI."

            });

        }

    }
);


/* ================================
   GERAR IMAGEM
================================ */

app.post(
    "/api/image",
    async function(req, res) {

        try {

            const prompt =
                cleanText(
                    req.body &&
                    req.body.prompt
                );

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
                "Gerando imagem:",
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
                    error &&
                    error.message
                        ? error.message
                        : "Não foi possível gerar a imagem."

            });

        }

    }
);


/* ================================
   EDITAR IMAGEM
================================ */

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
                cleanText(
                    req.body &&
                    req.body.prompt,
                    "Edite esta imagem de forma criativa."
                );

            console.log(
                "Editando imagem:",
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
                    error &&
                    error.message
                        ? error.message
                        : "Não foi possível editar a imagem."

            });

        }

    }
);


/* ================================
   LISTAR POSTS
================================ */

app.get(
    "/api/posts",
    function(req, res) {

        const ordered =
            posts
                .slice()
                .sort(
                    function(a, b) {

                        return (
                            new Date(b.createdAt) -
                            new Date(a.createdAt)
                        );

                    }
                );

        return res.json({

            success: true,

            posts:
                ordered

        });

    }
);


/* ================================
   CRIAR POST
================================ */

app.post(
    "/api/posts",
    function(req, res) {

        try {

            const image =
                cleanText(
                    req.body &&
                    req.body.image
                );

            const caption =
                cleanText(
                    req.body &&
                    req.body.caption
                );

            if (!image) {

                return res.status(400).json({

                    error:
                        "A imagem é obrigatória."

                });

            }

            if (
                !image.startsWith(
                    "data:image/"
                )
            ) {

                return res.status(400).json({

                    error:
                        "Formato de imagem inválido."

                });

            }

            const post = {

                id:
                    createId("post"),

                user: {

                    id:
                        DEFAULT_USER.id,

                    name:
                        DEFAULT_USER.name,

                    username:
                        DEFAULT_USER.username

                },

                image:
                    image,

                caption:
                    caption,

                likes:
                    0,

                liked:
                    false,

                archived:
                    false,

                comments:
                    [],

                createdAt:
                    now()

            };

            posts.unshift(
                post
            );

            return res.status(201).json({

                success: true,

                post:
                    post

            });

        } catch (error) {

            console.error(
                "ERRO /api/posts:",
                error
            );

            return res.status(500).json({

                error:
                    "Não foi possível publicar."

            });

        }

    }
);
/* ================================
   EDITAR LEGENDA
================================ */

app.post(
    "/api/posts/:id/edit",
    function(req, res) {

        const post =
            posts.find(
                function(item) {

                    return (
                        item.id ===
                        req.params.id
                    );

                }
            );

        if (!post) {

            return res.status(404).json({

                error:
                    "Publicação não encontrada."

            });

        }

        const caption =
            cleanText(
                req.body &&
                req.body.caption
            );

        post.caption =
            caption;

        return res.json({

            success: true,

            post:
                post

        });

    }
);


/* ================================
   APAGAR POST
================================ */

app.delete(
    "/api/posts/:id",
    function(req, res) {

        const index =
            posts.findIndex(
                function(post) {

                    return (
                        post.id ===
                        req.params.id
                    );

                }
            );

        if (index === -1) {

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

            success: true

        });

    }
);


/* ================================
   ARQUIVAR POST
================================ */

app.post(
    "/api/posts/:id/archive",
    function(req, res) {

        const post =
            posts.find(
                function(item) {

                    return (
                        item.id ===
                        req.params.id
                    );

                }
            );

        if (!post) {

            return res.status(404).json({

                error:
                    "Publicação não encontrada."

            });

        }

        post.archived =
            !post.archived;

        return res.json({

            success: true,

            archived:
                post.archived,

            post:
                post

        });

    }
);


/* ================================
   CURTIR POST
================================ */

app.post(
    "/api/posts/:id/like",
    function(req, res) {

        const post =
            posts.find(
                function(item) {

                    return (
                        item.id ===
                        req.params.id
                    );

                }
            );

        if (!post) {

            return res.status(404).json({

                error:
                    "Publicação não encontrada."

            });

        }

        post.liked =
            !post.liked;

        if (post.liked) {

            post.likes += 1;

        } else {

            post.likes =
                Math.max(
                    0,
                    post.likes - 1
                );

        }

        return res.json({

            success: true,

            liked:
                post.liked,

            likes:
                post.likes

        });

    }
);


/* ================================
   COMENTAR POST
================================ */

app.post(
    "/api/posts/:id/comments",
    function(req, res) {

        const post =
            posts.find(
                function(item) {

                    return (
                        item.id ===
                        req.params.id
                    );

                }
            );

        if (!post) {

            return res.status(404).json({

                error:
                    "Publicação não encontrada."

            });

        }

        const text =
            cleanText(
                req.body &&
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

            user: {

                id:
                    DEFAULT_USER.id,

                name:
                    DEFAULT_USER.name,

                username:
                    DEFAULT_USER.username

            },

            text:
                text,

            likes:
                0,

            liked:
                false,

            createdAt:
                now()

        };

        post.comments.push(
            comment
        );

        return res.status(201).json({

            success: true,

            comment:
                comment

        });

    }
);


/* ================================
   CURTIR COMENTÁRIO
================================ */

app.post(
    "/api/posts/:postId/comments/:commentId/like",
    function(req, res) {

        const post =
            posts.find(
                function(item) {

                    return (
                        item.id ===
                        req.params.postId
                    );

                }
            );

        if (!post) {

            return res.status(404).json({

                error:
                    "Publicação não encontrada."

            });

        }

        const comment =
            post.comments.find(
                function(item) {

                    return (
                        item.id ===
                        req.params.commentId
                    );

                }
            );

        if (!comment) {

            return res.status(404).json({

                error:
                    "Comentário não encontrado."

            });

        }

        comment.liked =
            !comment.liked;

        if (comment.liked) {

            comment.likes =
                (comment.likes || 0) + 1;

        } else {

            comment.likes =
                Math.max(
                    0,
                    (comment.likes || 0) - 1
                );

        }

        return res.json({

            success: true,

            liked:
                comment.liked,

            likes:
                comment.likes

        });

    }
);


/* ================================
   APAGAR COMENTÁRIO
================================ */

app.delete(
    "/api/posts/:postId/comments/:commentId",
    function(req, res) {

        const post =
            posts.find(
                function(item) {

                    return (
                        item.id ===
                        req.params.postId
                    );

                }
            );

        if (!post) {

            return res.status(404).json({

                error:
                    "Publicação não encontrada."

            });

        }

        const index =
            post.comments.findIndex(
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

        post.comments.splice(
            index,
            1
        );

        return res.json({

            success: true

        });

    }
);


/* =====================================================
   STATUS
===================================================== */


/* ================================
   LISTAR STATUS
================================ */

app.get(
    "/api/status",
    function(req, res) {

        const ordered =
            statuses
                .slice()
                .sort(
                    function(a, b) {

                        return (
                            new Date(b.createdAt) -
                            new Date(a.createdAt)
                        );

                    }
                );

        return res.json({

            success: true,

            statuses:
                ordered

        });

    }
);


/* ================================
   CRIAR STATUS
================================ */

app.post(
    "/api/status",
    function(req, res) {

        try {

            const image =
                cleanText(
                    req.body &&
                    req.body.image
                );

            const caption =
                cleanText(
                    req.body &&
                    req.body.caption
                );

            if (!image) {

                return res.status(400).json({

                    error:
                        "A imagem é obrigatória."

                });

            }

            if (
                !image.startsWith(
                    "data:image/"
                )
            ) {

                return res.status(400).json({

                    error:
                        "Formato de imagem inválido."

                });

            }

            const status = {

                id:
                    createId("status"),

                user: {

                    id:
                        DEFAULT_USER.id,

                    name:
                        DEFAULT_USER.name,

                    username:
                        DEFAULT_USER.username

                },

                image:
                    image,

                caption:
                    caption,

                likes:
                    0,

                liked:
                    false,

                comments:
                    [],

                createdAt:
                    now()

            };

            statuses.unshift(
                status
            );

            return res.status(201).json({

                success: true,

                status:
                    status

            });

        } catch (error) {

            console.error(
                "ERRO /api/status:",
                error
            );

            return res.status(500).json({

                error:
                    "Não foi possível publicar o status."

            });

        }

    }
);


/* ================================
   APAGAR STATUS
================================ */

app.delete(
    "/api/status/:id",
    function(req, res) {

        const index =
            statuses.findIndex(
                function(status) {

                    return (
                        status.id ===
                        req.params.id
                    );

                }
            );

        if (index === -1) {

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

            success: true

        });

    }
);


/* ================================
   CURTIR STATUS
================================ */

app.post(
    "/api/status/:id/like",
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

            liked:
                status.liked,

            likes:
                status.likes

        });

    }
);


/* ================================
   COMENTAR STATUS
================================ */

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
                req.body &&
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

            user: {

                id:
                    DEFAULT_USER.id,

                name:
                    DEFAULT_USER.name,

                username:
                    DEFAULT_USER.username

            },

            text:
                text,

            likes:
                0,

            liked:
                false,

            createdAt:
                now()

        };

        status.comments.push(
            comment
        );

        return res.status(201).json({

            success: true,

            comment:
                comment

        });

    }
);


/* ================================
   CURTIR COMENTÁRIO DO STATUS
================================ */

app.post(
    "/api/status/:statusId/comments/:commentId/like",
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

        const comment =
            status.comments.find(
                function(item) {

                    return (
                        item.id ===
                        req.params.commentId
                    );

                }
            );

        if (!comment) {

            return res.status(404).json({

                error:
                    "Comentário não encontrado."

            });

        }

        comment.liked =
            !comment.liked;

        if (comment.liked) {

            comment.likes =
                (comment.likes || 0) + 1;

        } else {

            comment.likes =
                Math.max(
                    0,
                    (comment.likes || 0) - 1
                );

        }

        return res.json({

            success: true,

            liked:
                comment.liked,

            likes:
                comment.likes

        });

    }
);


/* ================================
   APAGAR COMENTÁRIO DO STATUS
================================ */

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
   EDITAR LEGENDA DO STATUS
===================================================== */

app.post(
    "/api/status/:id/edit",
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

        status.caption =
            cleanText(
                req.body &&
                req.body.caption
            );

        return res.json({

            success: true,

            status:
                status

        });

    }
);


/* =====================================================
   ERROS
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
