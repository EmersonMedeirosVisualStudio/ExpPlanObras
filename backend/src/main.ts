import dotenv from "dotenv";
import server from "@/infra/http/server.js";

dotenv.config();

const start = async () => {
  try {
    const port = parseInt(
      process.env.PORT || process.env.API_PORT || "3333",
      10,
    );
    await server.listen({ port, host: "0.0.0.0" });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
