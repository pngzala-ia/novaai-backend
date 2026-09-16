const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const multer = require("multer");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
    console.warn("⚠️ OPENAI_API_KEY não configurada.");
}

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY
});


/* =====================================================
   CONFIGURAÇÃO
===================================================== */

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
}));

app.use(express.json({
    limit: "15mb"
}));


/* =====================================================
   UPLOAD
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
            cb(new Error("Envie somente uma imagem."));
        }

    }
});


/* =====================================================
   BANCO TEMPORÁRIO
===================================================== */

const posts = [];
const statuses = [];

let nextPostId = 1;
let nextStatusId = 1;
let nextCommentId = 1;


/* =====================================================
   FUNÇÕES AUXILIARES
===================================================== */

function createId() {
    return Date.now() + "-" + Math.random()
        .toString(36)
        .substring(2, 9);
}


function getTime() {

    return new Date().toLocaleTimeString(
        "pt-BR",
        {
            hour: "2-digit",
            minute: "2-digit"
        }
    );

}


function normalizeImageData(image) {

    if (
        typeof image !== "string" ||
        !image.startsWith("data:image/")
    ) {
        return null;
    }

    return image;
}


function findPost(id) {

    return posts.find(function(post) {
        return String(post.id) === String(id);
    });

}


function findStatus(id) {

    return statuses.find(function(status) {
        return String(status.id) === String(id);
    });

}


/* =====================================================
   ROTA PRINCIPAL
===================================================== */

app.get("/", function(req, res) {

    res.json({
        status: "online",
        app: "NovaAI + GeraçãoZ",
        openai: !!OPENAI_API_KEY,
        posts: posts.length,
        statuses: statuses.length
    });

});


/* =====================================================
   HEALTH
===================================================== */

app.get("/api/health", function(req, res) {

    res.json({
        ok: true,
        openai: !!OPENAI_API_KEY
    });

});


/* =====================================================
   CHAT
===================================================== */

app.post("/api/chat", async function(req, res) {

    try {

        const message =
            typeof req.body.message === "string"
                ? req.body.message.trim()
                : "";

        if (!message) {

            return res.status(400).json({
                error: "Digite uma mensagem."
            });

        }

        if (!OPENAI_API_KEY) {

            return res.status(500).json({
                error: "OPENAI_API_KEY não configurada no servidor."
            });

        }

        const response =
            await openai.responses.create({

                model: "gpt-5.6-luna",

                instructions: `
Você é a NovaAI, assistente oficial
da GeraçãoZ.

Responda em português do Brasil,
a menos que o usuário peça outro idioma.

Seja natural, útil e objetiva.

Pedidos de geração ou edição de imagens
são tratados pelas rotas específicas
do servidor.
                `,

                input: message

            });


        const answer = response.output_text;


        if (!answer) {

            return res.status(502).json({
                error: "A API não retornou texto."
            });

        }


        return res.json({
            response: answer,
            output_text: answer
        });


    } catch (error) {

        console.error("ERRO /api/chat:", error);

        return res.status(500).json({
            error:
                error?.message ||
                "Erro ao conversar com a NovaAI."
        });

    }

});


/* =====================================================
   GERAR IMAGEM
===================================================== */

app.post("/api/image", async function(req, res) {

    try {

        const prompt =
            typeof req.body.prompt === "string"
                ? req.body.prompt.trim()
                : "";

        if (!prompt) {

            return res.status(400).json({
                error: "Informe o que você quer criar."
            });

        }

        if (!OPENAI_API_KEY) {

            return res.status(500).json({
                error: "OPENAI_API_KEY não configurada no servidor."
            });

        }

        console.log("🖼️ Gerando imagem:", prompt);


        const result =
            await openai.images.generate({

                model: "gpt-image-2",

                prompt: prompt,

                size: "1024x1024"

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


        console.log("✅ Imagem criada.");


        return res.json({

            success: true,

            image: imageUrl,

            imageUrl: imageUrl,

            url: imageUrl

        });


    } catch (error) {

        console.error("ERRO /api/image:", error);

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

app.post(
    "/api/image/edit",
    upload.single("image"),
    async function(req, res) {

        try {

            if (!req.file) {

                return res.status(400).json({
                    error: "Nenhuma imagem foi enviada."
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
                    : "Edite esta imagem de forma criativa.";


            console.log(
                "✏️ Editando imagem:",
                prompt
            );


            const file =
                new File(
                    [req.file.buffer],
                    req.file.originalname || "imagem.png",
                    {
                        type:
                            req.file.mimetype ||
                            "image/png"
                    }
                );


            const result =
                await openai.images.edit({

                    model: "gpt-image-2",

                    image: file,

                    prompt: prompt,

                    size: "1024x1024"

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


            console.log("✅ Imagem editada.");


            return res.json({

                success: true,

                image: imageUrl,

                imageUrl: imageUrl,

                url: imageUrl

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
   PUBLICAR NO FEED
===================================================== */

app.post("/api/posts", function(req, res) {

    try {

        const image =
            normalizeImageData(req.body.image);

        const caption =
            typeof req.body.caption === "string"
                ? req.body.caption.trim()
                : "";


        if (!image) {

            return res.status(400).json({
                error: "Imagem inválida."
            });

        }


        const post = {

            id: nextPostId++,

            publicId: createId(),

            author: "Você",

            username: "@voce",

            image: image,

            caption: caption,

            likes: 0,

            liked: false,

            comments: [],

            createdAt: new Date().toISOString(),

            time: getTime()

        };


        posts.unshift(post);


        return res.json({
            success: true,
            post: post
        });


    } catch (error) {

        console.error("ERRO /api/posts:", error);

        return res.status(500).json({
            error: "Não foi possível publicar."
        });

    }

});


/* =====================================================
   LISTAR FEED
===================================================== */

app.get("/api/posts", function(req, res) {

    res.json({
        success: true,
        posts: posts
    });

});


/* =====================================================
   APAGAR POST
===================================================== */

app.delete("/api/posts/:id", function(req, res) {

    const index =
        posts.findIndex(function(post) {
            return String(post.id) === String(req.params.id);
        });


    if (index === -1) {

        return res.status(404).json({
            error: "Publicação não encontrada."
        });

    }


    posts.splice(index, 1);


    return res.json({
        success: true
    });

});


/* =====================================================
   CURTIR POST
===================================================== */

app.post("/api/posts/:id/like", function(req, res) {

    const post =
        findPost(req.params.id);


    if (!post) {

        return res.status(404).json({
            error: "Publicação não encontrada."
        });

    }


    post.liked = !post.liked;


    if (post.liked) {

        post.likes++;

    } else {

        post.likes =
            Math.max(
                0,
                post.likes - 1
            );

    }


    return res.json({

        success: true,

        liked: post.liked,

        likes: post.likes

    });

});


/* =====================================================
   COMENTAR POST
===================================================== */

app.post("/api/posts/:id/comments", function(req, res) {

    const post =
        findPost(req.params.id);


    if (!post) {

        return res.status(404).json({
            error: "Publicação não encontrada."
        });

    }


    const text =
        typeof req.body.text === "string"
            ? req.body.text.trim()
            : "";


    if (!text) {

        return res.status(400).json({
            error: "Digite um comentário."
        });

    }


    const comment = {

        id: nextCommentId++,

        author: "Você",

        username: "@voce",

        text: text,

        createdAt: new Date().toISOString(),

        time: getTime()

    };


    post.comments.push(comment);


    return res.json({

        success: true,

        comment: comment,

        comments: post.comments

    });

});


/* =====================================================
   APAGAR COMENTÁRIO DO POST
===================================================== */

app.delete(
    "/api/posts/:postId/comments/:commentId",
    function(req, res) {

        const post =
            findPost(req.params.postId);


        if (!post) {

            return res.status(404).json({
                error: "Publicação não encontrada."
            });

        }


        const index =
            post.comments.findIndex(
                function(comment) {

                    return String(comment.id) ===
                        String(req.params.commentId);

                }
            );


        if (index === -1) {

            return res.status(404).json({
                error: "Comentário não encontrado."
            });

        }


        post.comments.splice(index, 1);


        return res.json({
            success: true
        });

    }
);


/* =====================================================
   PUBLICAR STATUS
===================================================== */

app.post("/api/status", function(req, res) {

    try {

        const image =
            normalizeImageData(req.body.image);

        const text =
            typeof req.body.text === "string"
                ? req.body.text.trim()
                : "";


        if (!image) {

            return res.status(400).json({
                error: "Imagem inválida."
            });

        }


        const status = {

            id: nextStatusId++,

            publicId: createId(),

            author: "Você",

            username: "@voce",

            image: image,

            text: text,

            likes: 0,

            liked: false,

            comments: [],

            createdAt: new Date().toISOString(),

            time: getTime()

        };


        statuses.unshift(status);


        return res.json({

            success: true,

            status: status

        });


    } catch (error) {

        console.error(
            "ERRO /api/status:",
            error
        );


        return res.status(500).json({
            error: "Não foi possível publicar o status."
        });

    }

});


/* =====================================================
   LISTAR STATUS
===================================================== */

app.get("/api/status", function(req, res) {

    res.json({

        success: true,

        statuses: statuses

    });

});


/* =====================================================
   APAGAR STATUS
===================================================== */

app.delete("/api/status/:id", function(req, res) {

    const index =
        statuses.findIndex(
            function(status) {

                return String(status.id) ===
                    String(req.params.id);

            }
        );


    if (index === -1) {

        return res.status(404).json({
            error: "Status não encontrado."
        });

    }


    statuses.splice(index, 1);


    return res.json({
        success: true
    });

});


/* =====================================================
   CURTIR STATUS
===================================================== */

app.post("/api/status/:id/like", function(req, res) {

    const status =
        findStatus(req.params.id);


    if (!status) {

        return res.status(404).json({
            error: "Status não encontrado."
        });

    }


    status.liked =
        !status.liked;


    if (status.liked) {

        status.likes++;

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

});


/* =====================================================
   COMENTAR STATUS
===================================================== */

app.post(
    "/api/status/:id/comments",
    function(req, res) {

        const status =
            findStatus(req.params.id);


        if (!status) {

            return res.status(404).json({
                error: "Status não encontrado."
            });

        }


        const text =
            typeof req.body.text === "string"
                ? req.body.text.trim()
                : "";


        if (!text) {

            return res.status(400).json({
                error: "Digite um comentário."
            });

        }


        const comment = {

            id: nextCommentId++,

            author: "Você",

            username: "@voce",

            text: text,

            createdAt: new Date().toISOString(),

            time: getTime()

        };


        status.comments.push(comment);


        return res.json({

            success: true,

            comment: comment,

            comments: status.comments

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
            findStatus(req.params.statusId);


        if (!status) {

            return res.status(404).json({
                error: "Status não encontrado."
            });

        }


        const index =
            status.comments.findIndex(
                function(comment) {

                    return String(comment.id) ===
                        String(req.params.commentId);

                }
            );


        if (index === -1) {

            return res.status(404).json({
                error: "Comentário não encontrado."
            });

        }


        status.comments.splice(index, 1);


        return res.json({
            success: true
        });

    }
);


/* =====================================================
   PERFIL
===================================================== */

app.get("/api/profile", function(req, res) {

    res.json({

        success: true,

        profile: {

            name: "Você",

            username: "@voce",

            bio: "Criador da GeraçãoZ 🚀",

            posts: posts.length,

            followers: 0,

            following: 0

        },

        posts: posts

    });

});


/* =====================================================
   ERROS
===================================================== */

app.use(function(error, req, res, next) {

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

});


/* =====================================================
   INICIAR
===================================================== */


app.listen(PORT, function() {

    console.log(
        "================================="
    );

    console.log(
        "🚀 NovaAI + GeraçãoZ online"
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

});
