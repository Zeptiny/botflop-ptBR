module.exports = {
	name: 'privacy',
	description: 'Veja a política de privacidade do bot.',
	aliases: ['policy'],
	cooldown: 10,
	async execute(message, args, client) {
		try {
			message.reply('Veja a política de privacidade do bot em https://bin.birdflop.com/apezizinip.txt.');
		}
		catch (err) { client.error(err, message); }
	},
};