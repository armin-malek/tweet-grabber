require("dotenv").config();
const { Telegraf, Markup, Scenes, session } = require("telegraf");
const bot = new Telegraf(process.env.BOT_TOKEN);
const { configs } = require("./configs");
const { prisma } = require("../db");
const { default: axios } = require("axios");

bot.use(session());
setInterval(async () => {
  try {
    let posts = await prisma.posts.findMany({
      where: { isPosted: false, tweetUsersId: { gt: 0 } },
      include: { TweetUsers: true },
      take: 1,
      orderBy: { dateCreation: "asc" },
    });
    for (let post of posts) {
      console.log("post", post.id);
      console.log("media", post.mediaType);
      let resp;
      if (post.thumbUrl) {
        resp = await axios.head(post.thumbUrl, {
          validateStatus: () => true,
        });
      }
      // if (resp.status != 200) {
      //   console.log("head", resp.status);

      //   return;
      // }
      if (post.mediaType && resp?.status == 200) {
        await bot.telegram.sendMediaGroup(configs.chatId, [
          {
            type: "photo",
            media: { url: post.thumbUrl },
            caption: `"${post.TweetUsers.screenName}"\r\n------------\r\n${post.fullText}`,
          },
        ]);
      }
      if (!post.mediaType || resp?.status != 200) {
        await bot.telegram.sendMessage(
          configs.chatId,
          `"${post.TweetUsers.screenName}"\r\n------------\r\n${post.fullText}`
        );
      }

      await prisma.posts.update({
        where: { id: post.id },
        data: { isPosted: true },
      });
    }
  } catch (err) {
    console.log(err);
  }
}, 5000);

bot.start(async (ctx) => {
  await ctx.reply(
    "سلام",
    Markup.keyboard([["🔍 لیست جستحو"]])
      .oneTime()
      .resize()
  );
});

bot.command("settings", async (ctx) => {
  return await ctx.reply(
    "this is text",
    Markup.keyboard([["🔍 لیست جستحو"]])
      .oneTime()
      .resize()
  );
});

const searchTermWizard = new Scenes.WizardScene(
  "SEARCH_TERM_WIZARD", // first argument is Scene_ID, same as for BaseScene
  async (ctx) => {
    ctx.wizard.state.contactData = {};
    const searchTerms = await prisma.searchTerms.findMany();
    if (searchTerms.length == 0) {
      await ctx.reply(
        "لیست جستجو خالی است",
        Markup.keyboard([["➕افزودن"]])
          .oneTime()
          .resize()
      );
    } else {
      await ctx.reply(`${searchTerms.length} مورد در لیست جستجو وجود دارد`);
      let str = "";
      searchTerms.map((item) => (str += item.text + "\r\n"));
      await ctx.reply(str);
    }
    await ctx.reply(
      "لیست جدید را بفرستید یا لغو کنید",
      Markup.keyboard([["❌ لغو"]])
        .oneTime()
        .resize()
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.message.text == "❌ لغو") {
      await ctx.reply(
        "آپدیت لیست لغو شد",
        Markup.keyboard([["🔍 لیست جستحو"]])
          .oneTime()
          .resize()
      );
      return await ctx.scene.leave();
    }
    let newTerms = ctx.message.text.split("\n");
    let terms = await prisma.searchTerms.findMany();
    let termsToRemove = terms.filter((x) => !newTerms.includes(x.text));
    // console.log("termsToRemove", termsToRemove);
    if (termsToRemove.length > 0) {
      await prisma.searchTerms.deleteMany({
        where: { id: { in: termsToRemove.map((x) => x.id) } },
      });
    }
    await ctx.reply(
      `${termsToRemove.length} مورد حذف شد`,
      Markup.keyboard([["🔍 لیست جستحو"]])
        .oneTime()
        .resize()
    );
    return ctx.wizard.next();
  }
);

const stage = new Scenes.Stage([searchTermWizard]);
bot.use(stage.middleware());

bot.hears("🔍 لیست جستحو", async (ctx) => {
  if (ctx.message.from.id == process.env.ADMIN_ID)
    await ctx.scene.enter("SEARCH_TERM_WIZARD");
  else await ctx.reply("شما به این بخش دسترسی ندارید");
});
bot.launch();
console.log("bot launched");

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
