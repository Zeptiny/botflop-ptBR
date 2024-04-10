const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const YAML = require('yaml');
const fs = require('fs');
const createField = require('./createField.js');
const evalField = require('./evalField.js');
function componentToHex(c) {
	const hex = c.toString(16);
	return hex.length == 1 ? '0' + hex : hex;
}

module.exports = async function analyzeProfile(message, client, args) {
	const author = message.author ?? message.user;
	const ProfileEmbed = new EmbedBuilder()
		.setDescription('Estes não são valores mágicos. Muitas dessas configurações têm consequências reais na mecânica do seu servidor. Consulte [este guia](https://eternity.community/index.php/paper-optimization/) para obter informações detalhadas sobre a funcionalidade de cada configuração.')
		.setFooter({ text: `Requested by ${author.tag}`, iconURL: author.avatarURL() });

	let url;
	const fields = [];

	for (const arg of args) {
		if (message.commandName && (arg.startsWith('https://timin') || arg.startsWith('https://www.spigotmc.org/go/timings?url=') || arg.startsWith('https://spigotmc.org/go/timings?url='))) {
			ProfileEmbed.addFields([{ name: '⚠️ Timings Report', value: 'Este é um relatório de tempos. Use /timings para esse tipo de relatório.' }]);
			return [{ embeds: [ProfileEmbed] }];
		}

		// prevents the issue of the bot trying to analyze a link that is not a spark profile (e.g. a link to download spark or its documentation)
		const whitelist = ['https://spark.lucko.me/downloads', 'https://spark.lucko.me/download', 'https://spark.lucko.me/docs']
		if ( whitelist.some(v => arg.toLowerCase().startsWith(v))) return;

		if (arg.startsWith('https://spark.lucko.me/')) url = arg;
	}

	if (!url) return null;

	// Start typing
	if (!message.commandName) await message.channel.sendTyping();

	client.logger.info(`Spark Profile analisado de ${author.tag} (${author.id}): ${url}`);

	const response_raw = await fetch(url + '?raw=1');
	const sampler = await response_raw.json().catch(() => undefined);

	if (!sampler) {
		ProfileEmbed.setFields([{
			name: '❌ Erro de processamento',
			value: 'O bot não pode processar este perfil do Spark. Use um perfil alternativo do Spark.',
			inline: true,
		}]);
		ProfileEmbed.setColor(0xff0000);
		ProfileEmbed.setDescription(null);
		return [{ embeds: [ProfileEmbed] }];
	}
	
	const id = url.replace("https://spark.lucko.me/", "")
	fetch(process.env.API_URL + '/spark', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ id }),
	})
		.then(response => {
			if (response.ok) {
				return response.json();
			} else {
				throw new Error(`Request failed with status ${response.status}`);
			}
		})
		.then(data => {
			console.log('Response data:', data);
		})
		.catch(error => {
			console.error('Fetch error:', error);
		});
	
	if(!sampler.metadata.hasOwnProperty('serverConfigurations')) {
		ProfileEmbed.setFields([{
			name: '❌ Erro de processamento',
			value: 'O bot não pode processar este perfil do Spark. Este é um relatório de resumo de heap.',
			inline: true,
		}]);
		ProfileEmbed.setColor(0xff0000);
		ProfileEmbed.setDescription(null);
		return [{ embeds: [ProfileEmbed] }];
	}	
	ProfileEmbed.setAuthor({ name: 'Spark Profile Analysis', iconURL: 'https://i.imgur.com/deE1oID.png', url: url });

	const platform = sampler.metadata.platform.name;

	let version = sampler.metadata.platform.version;
	client.logger.info(version);

	if (version.endsWith('(MC: 1.17)')) version = version.replace('(MC: 1.17)', '(MC: 1.17.0)');

	let server_properties, bukkit, spigot, paper, purpur;

	const plugins = Object.values(sampler.metadata.sources);
	const configs = sampler.metadata.serverConfigurations;
	if (configs) {
		if (configs['server.properties']) server_properties = JSON.parse(configs['server.properties']);
		if (configs['bukkit.yml']) bukkit = JSON.parse(configs['bukkit.yml']);
		if (configs['spigot.yml']) spigot = JSON.parse(configs['spigot.yml']);
		if (configs['paper/']) paper = JSON.parse(configs['paper/']);
		if (configs['purpur.yml']) purpur = JSON.parse(configs['purpur.yml']);
	}

	const PROFILE_CHECK = {
		servers: await YAML.parse(fs.readFileSync('./analysis_config/servers.yml', 'utf8')),
		plugins: {
			paper: await YAML.parse(fs.readFileSync('./analysis_config/plugins/paper.yml', 'utf8')),
			purpur: await YAML.parse(fs.readFileSync('./analysis_config/plugins/purpur.yml', 'utf8')),
		},
		config: {
			'server.properties': await YAML.parse(fs.readFileSync('./analysis_config/server.properties.yml', 'utf8')),
			bukkit: await YAML.parse(fs.readFileSync('./analysis_config/bukkit.yml', 'utf8')),
			spigot: await YAML.parse(fs.readFileSync('./analysis_config/spigot.yml', 'utf8')),
			paper: await YAML.parse(fs.readFileSync('./analysis_config/profile/paper.yml', 'utf8')),
			purpur: await YAML.parse(fs.readFileSync('./analysis_config/purpur.yml', 'utf8')),
		},
	};

	// fetch the latest mc version
	const req = await fetch('https://api.purpurmc.org/v2/purpur');
	const json = await req.json();
	const latest = json.versions[json.versions.length - 1];

	// ghetto version check
	const mcversion = version.split('(MC: ')[1];
	if(mcversion == undefined) {
		ProfileEmbed.setFields([{
			name: '❌ Erro de processamento',
			value: 'O bot não pode processar este perfil do Spark. Parece que a plataforma não é compatível para análise. Plataforma: ' + platform,
			inline: true,
		}]);
		ProfileEmbed.setColor(0xff0000);
		ProfileEmbed.setDescription(null);
		return [{ embeds: [ProfileEmbed] }];
	}
	if (mcversion.split(')')[0] != latest) {
		version = version.replace('git-', '').replace('MC: ', '');
		fields.push({ name: '❌ Desatualizado', value: `Você está utilizando \`${version}\`. Atualize para \`${latest}\`.`, inline: true });
	}

	if (PROFILE_CHECK.servers) {
		PROFILE_CHECK.servers.forEach(server => {
			if (version.includes(server.name)) fields.push(createField(server));
		});
	}

	const flags = sampler.metadata.systemStatistics.java.vmArgs;
	const jvm_version = sampler.metadata.systemStatistics.java.version;

	if (flags.includes('-XX:+UseZGC') && flags.includes('-Xmx')) {
		const flaglist = flags.split(' ');
		flaglist.forEach(flag => {
			if (flag.startsWith('-Xmx')) {
				let max_mem = flag.split('-Xmx')[1];
				max_mem = max_mem.replace('G', '000');
				max_mem = max_mem.replace('M', '');
				max_mem = max_mem.replace('g', '000');
				max_mem = max_mem.replace('m', '');
				if (parseInt(max_mem) < 10000) fields.push({ name: '❌ Low Memory', value:'ZGC apenas é bom quando se utiliza muita memória.', inline: true });
			}
		});
	}
	else if (flags.includes('-Daikars.new.flags=true')) {
		if (!flags.includes('-XX:+PerfDisableSharedMem')) fields.push({ name: '❌ Outdated Flags', value: 'Add `-XX:+PerfDisableSharedMem` to flags.', inline: true });
		if (!flags.includes('-XX:G1MixedGCCountTarget=4')) fields.push({ name: '❌ Outdated Flags', value: 'Add `XX:G1MixedGCCountTarget=4` to flags.', inline: true });
		if (!flags.includes('-XX:+UseG1GC') && jvm_version.startsWith('1.8.')) fields.push({ name: '❌ Aikar\'s Flags', value: 'Você deve usar G1GC quando se tem as flags do Aikar', inline: true });
		if (flags.includes('-Xmx')) {
			let max_mem = 0;
			const flaglist = flags.split(' ');
			flaglist.forEach(flag => {
				if (flag.startsWith('-Xmx')) {
					max_mem = flag.split('-Xmx')[1];
					max_mem = max_mem.replace('G', '000');
					max_mem = max_mem.replace('M', '');
					max_mem = max_mem.replace('g', '000');
					max_mem = max_mem.replace('m', '');
				}
			});
			if (parseInt(max_mem) < 5400) fields.push({ name: '❌ Baixa memória', value: 'Aloque pelo menos 6-10GB se conseguir proporcionar.', inline: true });
			if (1000 * sampler.metadata.platformStatistics.playerCount / parseInt(max_mem) > 6 && parseInt(max_mem) < 10000) fields.push({ name: '❌ Baixa memória', value: 'Você deveria ter mais RAM com esse tanto de jogadores.', inline: true });
			if (flags.includes('-Xms')) {
				let min_mem = 0;
				flaglist.forEach(flag => {
					if (flag.startsWith('-Xmx')) {
						min_mem = flag.split('-Xmx')[1];
						min_mem = min_mem.replace('G', '000');
						min_mem = min_mem.replace('M', '');
						min_mem = min_mem.replace('g', '000');
						min_mem = min_mem.replace('m', '');
					}
				});
				if (min_mem != max_mem) fields.push({ name: '❌ Aikar\'s Flags', value: 'O seu Xmx e Xms devem ser iguais quando se utiliza as flags do Aikar.', inline: true });
			}
		}
	}
	else if (flags.includes('-Dusing.aikars.flags=mcflags.emc.gs')) {
		fields.push({ name: '❌ Flags Desatualizadas', value: 'Atualize as [Aikar\'s flags](https://aikar.co/2018/07/02/tuning-the-jvm-g1gc-garbage-collector-flags-for-minecraft/).', inline: true });
	}
	else {
		fields.push({ name: '❌ Aikar\'s Flags', value: 'Use [Aikar\'s flags](https://aikar.co/2018/07/02/tuning-the-jvm-g1gc-garbage-collector-flags-for-minecraft/).', inline: true });
	}

	const cpu = sampler.metadata.systemStatistics.cpu.threads;
	if (cpu <= 2) fields.push({ name: '❌ Threads', value: `Você apenas tem ${cpu} thread(s). Encontre uma [host melhor](https://docs.artbenedetti.com/hospedagem/comparacao).`, inline: true });

	// Probably a way to do this, idk yet
	// const handlers = Object.keys(request_raw.idmap.handlers).map(i => { return request_raw.idmap.handlers[i]; });
	// handlers.forEach(handler => {
	// 	let handler_name = handler[1];
	// 	if (handler_name.startsWith('Command Function - ') && handler_name.endsWith(':tick')) {
	// 		handler_name = handler_name.split('Command Function - ')[1].split(':tick')[0];
	// 		fields.push({ name: `❌ ${handler_name}`, value: 'This datapack uses command functions which are laggy.', inline: true });
	// 	}
	// });

	if (PROFILE_CHECK.plugins) {
		Object.keys(PROFILE_CHECK.plugins).forEach(server_name => {
			if (Object.keys(configs).includes(server_name)) {
				plugins.forEach(plugin => {
					Object.keys(PROFILE_CHECK.plugins[server_name]).forEach(plugin_name => {
						if (plugin.name == plugin_name) {
							const stored_plugin = PROFILE_CHECK.plugins[server_name][plugin_name];
							stored_plugin.name = plugin_name;
							fields.push(createField(stored_plugin));
						}
					});
				});
			}
		});
	}

	if (PROFILE_CHECK.config) {
		Object.keys(PROFILE_CHECK.config).map(i => { return PROFILE_CHECK.config[i]; }).forEach(config => {
			Object.keys(config).forEach(option_name => {
				const option = config[option_name];
				evalField(fields, option, option_name, plugins, server_properties, bukkit, spigot, paper, null, purpur, client);
			});
		});
	}

	plugins.forEach(plugin => {
		if (plugin.authors && plugin.authors.toLowerCase().includes('songoda')) {
			if (plugin.name == 'EpicHeads') fields.push({ name: '❌ EpicHeads', value: 'Esse plugin foi feito pela Songoda. Songoda é incompleta/redumentar. Você deveria encontrar uma alternativa melhor, como [HeadsPlus](https://spigotmc.org/resources/headsplus-»-1-8-1-16-4.40265/) ou [HeadDatabase](https://www.spigotmc.org/resources/head-database.14280/).', inline: true });
			else if (plugin.name == 'UltimateStacker') fields.push({ name: '❌ UltimateStacker', value: 'Stacking plugins actually causes more lag.\nRemove UltimateStacker.', inline: true });
			else fields.push({ name: `❌ ${plugin.name}`, value: 'Esse plugin foi feito pela Songoda. Songoda é incompleta/redumentar. Você deveria encontrar uma alternativa melhor.', inline: true });
		}
	});

	// No way to get gamerules from spark
	// const worlds = sampler.metadata.platformStatistics.world.worlds;
	// let high_mec = false;
	// worlds.forEach(world => {
	// 	const max_entity_cramming = parseInt(world.gamerules.maxEntityCramming);
	// 	if (max_entity_cramming >= 24) high_mec = true;
	// });
	// if (high_mec) fields.push({ name: '❌ maxEntityCramming', value: 'Decrease this by running the /gamerule command in each world. Recommended: 8.', inline: true });

	const tpstypes = sampler.metadata.platformStatistics.tps;
	const avgtps = Math.round((tpstypes.last1m + tpstypes.last5m + tpstypes.last15m) / 3);
	let red = 0;
	let green = 0;
	if (avgtps < 10) {
		red = 255;
		green = 255 * (0.1 * avgtps);
	}
	else {
		red = 255 * (-0.1 * avgtps + 2);
		green = 255;
	}

	ProfileEmbed.setColor(parseInt('0x' + componentToHex(red) + componentToHex(green) + '00'));

	if (fields.length == 0) {
		ProfileEmbed.addFields([{ name: '✅ Tudo certo', value: 'Analisado sem recomendações.' }]);
		return [{ embeds: [ProfileEmbed] }];
	}
	let components = [];
	const suggestions = [...fields];
	if (suggestions.length >= 13) {
		fields.splice(12, suggestions.length, { name: `Mais ${suggestions.length - 12} recomendações`, value: 'Clique nos botões abaixo para ver mais' });
		ProfileEmbed.setFooter({ text: `Requested by ${author.tag} • Page 1 of ${Math.ceil(suggestions.length / 12)}`, iconURL: author.avatarURL() });
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
	ProfileEmbed.addFields(fields);
	if (avgtps >= 19) {
		ProfileEmbed.setFields([{ name: '✅ O seu servidor não está lagando', value: `Ele está rodando bem, com um TPS médio de ${avgtps}.` }]);
		components = [
			new ActionRowBuilder()
				.addComponents([
					new ButtonBuilder()
						.setCustomId('analysis_force')
						.setLabel('Forçar análise')
						.setStyle(ButtonStyle.Secondary),
					new ButtonBuilder()
						.setURL('https://github.com/pemigrade/botflop')
						.setLabel('Botflop')
						.setStyle(ButtonStyle.Link),
				]),
		];
	}
	return [{ embeds: [ProfileEmbed], components }, suggestions];
};
