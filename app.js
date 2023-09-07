require("dotenv").config();
const { v4: uuidv4 } = require("uuid");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Bot } = require("grammy");
const input = require("input");
const { Link, User, sequelize } = require("./database");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const botToken = process.env.BOT_TOKEN;
const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;

let envSTRING_SESSION = process.env.STRING_SESSION;
let stringSession = new StringSession(envSTRING_SESSION);
if (!envSTRING_SESSION && fs.existsSync("session.txt")) {
  stringSession = new StringSession(fs.readFileSync("session.txt", "utf8"));
}

sequelize.sync();

class service {
  constructor() {
    this.__init();
  }

  __init = async () => {
    this.client = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 5,
    });
    await this.client.start({
      phoneNumber: async () => await input.text("Please enter your number: "),
      password: async () => await input.text("Please enter your password: "),
      phoneCode: async () =>
        await input.text("Please enter the code you received: "),
      onError: (err) => console.log(err),
    });
    fs.writeFileSync("session.txt", this.client.session.save());

    this.bot = new Bot(botToken);
    this.bot.command("start", async (ctx) => {
      try {
        await User.findOrCreate({ where: { chatId: ctx.chat.id } });
        await ctx.reply(
          "Fui criado por @DanlinoX\n\nVocê agora está na lista para receber atualizações do PGSharp."
        );
      } catch (error) {
        await ctx.reply("Ocorreu um erro ao registrar seu ID.");
      }
    });
    this.bot.use(async (ctx, next) => {
      if (
        ctx?.message?.caption &&
        ctx.message.caption.startsWith(this.fileVerificationCode)
      ) {
        const fileId = ctx.message.document.file_id;
        const users = await User.findAll();
        for (let i = 0; i < users.length; i++) {
          await this.bot.api
            .sendDocument(users[i].chatId, fileId, {
              caption: `O PGSharp atualizou, aqui está a nova versão :)\n\n@DanlinoX`,
            })
            .catch((e) => {
              console.log(`Falha ao enviar arquivo para ${users[i].chatId}`, e);
            });
        }
      }
      next();
    });

    this.bot.start();
    const botData = await this.bot.api.getMe();
    this.botUsername = botData.username;
    this.checkLink();
  };

  checkLink = async () => {
    try {
      const response = await axios.get("https://www.pgsharp.com/download", {
        maxRedirects: 0,
        validateStatus: function (status) {
          return status === 302;
        },
      });

      const newUrl = response.headers.location;
      const lastLink = await Link.findOne({ order: [["createdAt", "DESC"]] });

      if (!lastLink || lastLink.url !== newUrl) {
        await Link.create({ url: newUrl });
        await this.downloadFile(newUrl);
      }
    } catch (error) {
      console.error("Erro ao verificar o link:", error);
    }
    await new Promise((resolve) => setTimeout(resolve, 60000));
    setImmediate(this.checkLink);
  };

  downloadFile = async (url) => {
    const filename = path.basename(url);
    const localPath = path.join(__dirname, filename);

    const response = await axios.get(url, { responseType: "stream" });
    const writer = fs.createWriteStream(localPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", async () => {
        try {
          await this.client.connect();

          this.fileVerificationCode = uuidv4();

          const result = await this.client.sendMessage(this.botUsername, {
            message: this.fileVerificationCode + " - " + filename,
            file: localPath,
          });
          fs.unlink(localPath, (err) => {
            if (err) {
              console.error("Erro ao deletar o arquivo:", err);
              reject(err);
              return;
            }
            console.log("Arquivo deletado com sucesso!");
          });
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      writer.on("error", reject);
    });
  };
}

new service();
