const apiKey = process.env.OPENAI_API_KEY?.trim();

if (!apiKey) {
    console.error("ERRO: OPENAI_API_KEY não configurada.");
} else {
    console.log(
        "OPENAI KEY:",
        apiKey.substring(0, 8) +
        "..." +
        apiKey.substring(apiKey.length - 4)
    );
}
