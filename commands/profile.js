const analyzeProfile = require('../functions/analyzeProfile.js');
const { EmbedBuilder, ApplicationCommandOptionType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
module.exports = {
	name: 'profile',
	description: 'Analise um profiler do SPark para ajudar a otimizar o seu servidor.',
	args: true,
	usage: '<Spark Profile Link>',
	options: [{
		'type': ApplicationCommandOptionType.String,
		'name': 'url',
		'description': 'O URL do Profiler do Spark',
		'required': true,
	}],
	async execute(message, args, client) {
		try {
			const profileresult = await analyzeProfile(message, client, args);
			const profilemsg = await message.reply(profileresult ? profileresult[0] : 'URL do Profile Inválido.');
			if (!profileresult) return;

			// Get the issues from the profile result
			const suggestions = profileresult[1];
			if (!suggestions) return;
			const filter = i => i.user.id == (message.author ?? message.user).id && i.customId.startsWith('analysis_');
			const collector = profilemsg.createMessageComponentCollector({ filter, time: 300000 });
			collector.on('collect', async i => {
				// Defer button
				await i.deferUpdate();

				// Get the embed
				const ProfileEmbed = new EmbedBuilder(i.message.embeds[0].toJSON());
				const footer = ProfileEmbed.toJSON().footer;

				// Force analysis button
				if (i.customId == 'analysis_force') {
					const fields = [...suggestions];
					const components = [];
					if (suggestions.length >= 13) {
						fields.splice(12, suggestions.length, { name: '✅ O seu servidor não está lagando', value: `**Mais ${suggestions.length - 12} recomendações**\nClique no link abaixo para ver mais` });
						components.push(
							new ActionRowBuilder()
								.addComponents([
									new ButtonBuilder()
										.setCustomId('analysis_prev')
										.setEmoji({ name: '⬅️' })
										.setStyle(ButtonStyle.Secondary),
									new ButtonBuilder()
										.setCustomId('analysis_next')
										.setEmoji({ name: '➡️' })
										.setStyle(ButtonStyle.Secondary),
									new ButtonBuilder()
										.setURL('https://github.com/pemigrade/botflop')
										.setLabel('Botflop')
										.setStyle(ButtonStyle.Link),
								]),
						);
					}
					ProfileEmbed.setFields(fields);

					// Send the embed
					return i.editReply({ embeds: [ProfileEmbed], components });
				}

				// Calculate total amount of pages and get current page from embed footer
				const text = footer.text.split(' • ');
				const lastPage = parseInt(text[text.length - 1].split('Page ')[1].split(' ')[0]);
				const maxPages = parseInt(text[text.length - 1].split('Page ')[1].split(' ')[2]);

				// Get next page (if last page, go to pg 1)
				const page = i.customId == 'analysis_next' ? lastPage == maxPages ? 1 : lastPage + 1 : lastPage - 1 ? lastPage - 1 : maxPages;
				const end = page * 12;
				const start = end - 12;
				const fields = suggestions.slice(start, end);

				// Update the embed
				text[text.length - 1] = `Page ${page} of ${Math.ceil(suggestions.length / 12)}`;
				ProfileEmbed
					.setFields(fields)
					.setFooter({ iconURL: footer.icon_url, text: text.join(' • ') });

				// Send the embed
				i.editReply({ embeds: [ProfileEmbed] });
			});

			// When the collector stops, remove all buttons from it
			collector.on('end', () => {
				if (message.commandName) message.editReply({ components: [] }).catch(err => client.logger.warn(err));
				else profilemsg.edit({ components: [] }).catch(err => client.logger.warn(err));
			});
		}
		catch (err) { client.error(err, message); }
	},
};