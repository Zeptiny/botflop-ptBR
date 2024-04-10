const analyzeTimings = require('../functions/analyzeTimings.js');
const { EmbedBuilder, ApplicationCommandOptionType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
module.exports = {
	name: 'timings',
	description: 'Analise o Timings do Paper para ajudar a otimizar o seu servidor.',
	args: true,
	usage: '<Timings Link>',
	options: [{
		'type': ApplicationCommandOptionType.String,
		'name': 'url',
		'description': 'The Timings URL',
		'required': true,
	}],
	async execute(message, args, client) {
		try {
			const timingsresult = await analyzeTimings(message, client, args);
			const timingsmsg = await message.reply(timingsresult ? timingsresult[0] : 'URL do Timings inválido.');
			if (!timingsresult) return;

			// Get the issues from the timings result
			const suggestions = timingsresult[1];
			if (!suggestions) return;
			const filter = i => i.user.id == (message.author ?? message.user).id && i.customId.startsWith('analysis_');
			const collector = timingsmsg.createMessageComponentCollector({ filter, time: 300000 });
			collector.on('collect', async i => {
				// Defer button
				await i.deferUpdate();

				// Get the embed
				const TimingsEmbed = new EmbedBuilder(i.message.embeds[0].toJSON());
				const footer = TimingsEmbed.toJSON().footer;

				// Force analysis button
				if (i.customId == 'analysis_force') {
					const fields = [...suggestions];
					const components = [];
					if (suggestions.length >= 13) {
						fields.splice(12, suggestions.length, { name: '✅ O seu servidor não está lagando', value: `**Mais ${suggestions.length - 12} recomendações**\nClique no botão abaixo para ver mais` });
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
					TimingsEmbed.setFields(fields);

					// Send the embed
					return i.editReply({ embeds: [TimingsEmbed], components });
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
				TimingsEmbed
					.setFields(fields)
					.setFooter({ iconURL: footer.icon_url, text: text.join(' • ') });

				// Send the embed
				i.editReply({ embeds: [TimingsEmbed] });
			});

			// When the collector stops, remove all buttons from it
			collector.on('end', () => {
				if (message.commandName) message.editReply({ components: [] }).catch(err => client.logger.warn(err));
				else timingsmsg.edit({ components: [] }).catch(err => client.logger.warn(err));
			});
		}
		catch (err) { client.error(err, message); }
	},
};