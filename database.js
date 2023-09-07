const { Sequelize } = require("sequelize");

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "./database.sqlite3",
});

const Link = sequelize.define("Link", {
  url: {
    type: Sequelize.STRING,
    allowNull: false,
  },
});

const User = sequelize.define("User", {
  chatId: {
    type: Sequelize.INTEGER,
    allowNull: false,
    unique: true,
  },
});

module.exports = { sequelize, Link, User };
