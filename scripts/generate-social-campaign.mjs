import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import twitterText from "twitter-text";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fontDirectory = path.join(root, "scripts", "fonts");
const campaignFile = process.argv[2];

if (!campaignFile) {
	throw new Error("Usage: npm run generate:campaign -- campaigns/<campaign>.json");
}

process.env.FONTCONFIG_FILE = "fonts.conf";
process.env.FONTCONFIG_PATH = fontDirectory;

const { default: sharp } = await import("sharp");
const campaign = JSON.parse(await readFile(path.resolve(root, campaignFile), "utf8"));
const outputDirectory = path.resolve(root, campaign.outputDirectory);
const publicDirectory = path.join(root, "public");
const markerName = ".social-campaign.json";
const generationDirectory = `${outputDirectory}.tmp-${process.pid}`;
const backupDirectory = `${outputDirectory}.backup-${process.pid}`;

if (!outputDirectory.startsWith(`${publicDirectory}${path.sep}`)) {
	throw new Error("Campaign outputDirectory must be inside public/");
}

const outputParent = path.dirname(outputDirectory);
const realPublicDirectory = await realpath(publicDirectory);

const nearestExistingAncestor = async (candidate) => {
	try {
		return await realpath(candidate);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
		const parent = path.dirname(candidate);
		if (parent === candidate) throw error;
		return nearestExistingAncestor(parent);
	}
};

const realAncestor = await nearestExistingAncestor(outputParent);
if (
	realAncestor !== realPublicDirectory &&
	!realAncestor.startsWith(`${realPublicDirectory}${path.sep}`)
) {
	throw new Error("Campaign outputDirectory resolves outside public/");
}

await mkdir(outputParent, { recursive: true });
const realOutputParent = await realpath(outputParent);

if (
	realOutputParent !== realPublicDirectory &&
	!realOutputParent.startsWith(`${realPublicDirectory}${path.sep}`)
) {
	throw new Error("Campaign outputDirectory resolves outside public/");
}

const escapeXml = (value) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");

const textLines = ({ lines, x, y, size, lineHeight, family, fill, weight = 400 }) =>
	lines
		.map(
			(line, index) =>
				`<text x="${x}" y="${y + index * lineHeight}" fill="${fill}" font-family="${family}" font-size="${size}" font-weight="${weight}">${escapeXml(line)}</text>`,
		)
		.join("");

const hashtags = (items) => items.map((item) => `#${item}`).join(" ");

const xMetrics = (copy) => twitterText.parseTweet(copy);

const speakerNames = (card, conjunction = " and ") =>
	card.speakers.map((speaker) => speaker.name).join(conjunction);

const speakerVerb = (card) => (card.speakers.length === 1 ? "is" : "are");

const titleForCopy = (card) => (card.officialTitle === false ? card.title : `"${card.title}"`);

const makeXCopy = (card) =>
	`${speakerNames(card)} of ${card.company} ${speakerVerb(card)} speaking at ${campaign.event.name}.

${titleForCopy(card)}

${campaign.event.date} in ${campaign.event.location}.
${campaign.event.url}

${hashtags(campaign.campaign.xHashtags)}`;

const makeLinkedInCopy = (card) =>
	`${speakerNames(card)} of ${card.company} ${speakerVerb(card)} speaking at ${campaign.event.name} on ${campaign.event.date} in ${campaign.event.location}.

${titleForCopy(card)}${card.summary ? `\n\n${card.summary}` : ""}

Register: ${campaign.event.url}

${hashtags(campaign.campaign.linkedinHashtags)}`;

const validateCampaign = async () => {
	if (campaign.schemaVersion !== 2) throw new Error("Unsupported campaign schemaVersion");
	if (!campaign.cards?.length) throw new Error("Campaign must contain at least one card");
	if (!campaign.brand?.highlight) throw new Error("Campaign must define brand text");
	if (campaign.campaign.xHashtags.length > 2) throw new Error("X campaigns may use at most two hashtags");
	if (
		campaign.campaign.linkedinHashtags.length < 3 ||
		campaign.campaign.linkedinHashtags.length > 5
	) {
		throw new Error("LinkedIn campaigns must use three to five hashtags");
	}

	const slugs = new Set();
	for (const card of campaign.cards) {
		if (!card.speakers?.length) throw new Error(`${card.slug} must define at least one speaker`);
		if (card.speakers.length > 2) throw new Error(`${card.slug} may define at most two speakers`);
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(card.slug)) {
			throw new Error(`${speakerNames(card)}'s slug must contain lowercase letters, numbers, and hyphens only`);
		}
		if (slugs.has(card.slug)) throw new Error(`Duplicate card slug: ${card.slug}`);
		slugs.add(card.slug);
		for (const speaker of card.speakers) {
			if (!speaker.name || !speaker.portrait) {
				throw new Error(`${card.slug} has a speaker without a name or portrait`);
			}
			const realPortrait = await realpath(path.resolve(root, speaker.portrait));
			if (!realPortrait.startsWith(`${realPublicDirectory}${path.sep}`)) {
				throw new Error(`${speaker.name}'s portrait must be inside public/`);
			}
		}
		if (!card.summary && card.layouts.x.summaryLines.length) {
			throw new Error(`${speakerNames(card)} has summary lines without a summary`);
		}

		const xCopy = makeXCopy(card);
		const linkedInCopy = makeLinkedInCopy(card);
		if (!xMetrics(xCopy).valid) {
			throw new Error(`${speakerNames(card)}'s X copy exceeds 280 weighted characters`);
		}
		if (linkedInCopy.length > 3000) {
			throw new Error(`${speakerNames(card)}'s LinkedIn copy exceeds 3,000 characters`);
		}
		if (linkedInCopy.split("\n", 1)[0].length > 150) {
			throw new Error(`${speakerNames(card)}'s LinkedIn opening line exceeds 150 characters`);
		}
	}
};

const makeBackground = ({ width, height, accent, watermarkSize, watermarkY }) => `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
	<defs>
		<radialGradient id="glow" cx="78%" cy="38%" r="68%">
			<stop offset="0" stop-color="${accent}" stop-opacity="0.18"/>
			<stop offset="0.48" stop-color="#14121a" stop-opacity="0.7"/>
			<stop offset="1" stop-color="${campaign.theme.ink}"/>
		</radialGradient>
		<pattern id="lines" width="42" height="42" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
			<line x1="0" y1="0" x2="0" y2="42" stroke="${campaign.theme.paper}" stroke-opacity="0.025" stroke-width="2"/>
		</pattern>
	</defs>
	<rect width="${width}" height="${height}" fill="${campaign.theme.ink}"/>
	<rect width="${width}" height="${height}" fill="url(#glow)"/>
	<rect width="${width}" height="${height}" fill="url(#lines)"/>
	<circle cx="${width - 40}" cy="60" r="250" fill="none" stroke="${accent}" stroke-opacity="0.12" stroke-width="70"/>
	<text x="${width - 10}" y="${watermarkY}" fill="${campaign.theme.paper}" fill-opacity="0.025" font-family="Anton, sans-serif" font-size="${watermarkSize}" font-weight="700" text-anchor="end">MOQ</text>
</svg>`;

const brand = ({ x, y, size, accent }) => `
	<text x="${x}" y="${y}" font-family="Anton, sans-serif" font-size="${size}" font-weight="700" letter-spacing="2">
		<tspan fill="${campaign.theme.paper}">${escapeXml(campaign.brand.prefix)}</tspan><tspan fill="${accent}">${escapeXml(campaign.brand.highlight)}</tspan><tspan fill="${campaign.theme.paper}">${escapeXml(campaign.brand.suffix)}</tspan>
	</text>`;

const portraitGeometry = (card, platform) => {
	const multipleSpeakers = card.speakers.length > 1;
	if (platform === "x") {
		return multipleSpeakers
			? { left: 740, top: 240, width: 400, height: 250 }
			: { left: 760, top: 200, width: 380, height: 500 };
	}

	return multipleSpeakers
		? { left: 820, top: 145, width: 330, height: 206 }
		: { left: 850, top: 132, width: 300, height: 350 };
};

const makeXOverlay = (card, portrait) => {
	const layout = card.layouts.x;
	const titleY = layout.titleSize >= 76 ? 265 : 235;
	const titleBottom = titleY + (layout.titleLines.length - 1) * layout.lineHeight;
	const summaryY = titleBottom + 90;
	const displayedNames = speakerNames(card, " + ").toUpperCase();
	const speakerSize = layout.speakerSize ?? 88;
	const summary = layout.summaryLines.length
		? textLines({ lines: layout.summaryLines, x: 70, y: summaryY, size: 34, lineHeight: 52, family: "DM Mono, monospace", fill: campaign.theme.copy, weight: 500 })
		: "";

	return `
<svg width="1200" height="1200" viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg">
	<rect x="${portrait.left}" y="${portrait.top}" width="${portrait.width}" height="${portrait.height}" fill="none" stroke="${card.accent}" stroke-width="6"/>
	<path d="M1142 ${portrait.top + 16}V${portrait.top + portrait.height - 16}" stroke="${campaign.theme.paper}" stroke-opacity="0.55" stroke-width="2"/>

	${brand({ x: 70, y: 96, size: 72, accent: card.accent })}
	<text x="72" y="143" fill="${card.accent}" font-family="DM Mono, monospace" font-size="22" font-weight="500" letter-spacing="3">${escapeXml(campaign.campaign.label)}</text>
	<text x="1138" y="92" fill="${campaign.theme.paper}" font-family="DM Mono, monospace" font-size="24" text-anchor="end">${escapeXml(campaign.event.dateShort)} / ${escapeXml(campaign.event.location.toUpperCase())}</text>
	<text x="1138" y="132" fill="${campaign.theme.muted}" font-family="DM Mono, monospace" font-size="21" text-anchor="end">${escapeXml(campaign.event.subject.toUpperCase())}</text>

	${textLines({ lines: layout.titleLines, x: 70, y: titleY, size: layout.titleSize, lineHeight: layout.lineHeight, family: "Anton, sans-serif", fill: campaign.theme.paper, weight: 700 })}

	${summary}

	<rect x="${portrait.left + 40}" y="${portrait.top + portrait.height - 56}" width="${portrait.width - 80}" height="36" fill="${card.accent}"/>
	<text x="${portrait.left + portrait.width / 2}" y="${portrait.top + portrait.height - 30}" fill="${campaign.theme.ink}" font-family="DM Mono, monospace" font-size="20" font-weight="500" text-anchor="middle">${escapeXml(campaign.campaign.label)}</text>

	<line x1="70" y1="932" x2="1138" y2="932" stroke="${campaign.theme.paper}" stroke-opacity="0.25" stroke-width="2"/>
	<text x="70" y="1036" fill="${campaign.theme.paper}" font-family="Anton, sans-serif" font-size="${speakerSize}" font-weight="700">${escapeXml(displayedNames)}</text>
	<text x="74" y="1090" fill="${card.accent}" font-family="DM Mono, monospace" font-size="32" font-weight="500" letter-spacing="3">${escapeXml(card.company.toUpperCase())}</text>
	<text x="70" y="1150" fill="${campaign.theme.muted}" font-family="DM Mono, monospace" font-size="28">${escapeXml(campaign.event.venueShort)}</text>
	<text x="1138" y="1150" fill="${campaign.theme.paper}" font-family="DM Mono, monospace" font-size="28" text-anchor="end">${escapeXml(campaign.event.displayUrl)}</text>
</svg>`;
};

const makeLinkedInOverlay = (card, portrait) => {
	const layout = card.layouts.linkedin;
	const titleY = 190;
	const displayedNames = speakerNames(card, " + ").toUpperCase();
	const speakerSize = layout.speakerSize ?? 64;

	return `
<svg width="1200" height="627" viewBox="0 0 1200 627" xmlns="http://www.w3.org/2000/svg">
	<rect x="${portrait.left}" y="${portrait.top}" width="${portrait.width}" height="${portrait.height}" fill="none" stroke="${card.accent}" stroke-width="6"/>

	${brand({ x: 50, y: 73, size: 54, accent: card.accent })}
	<text x="52" y="111" fill="${card.accent}" font-family="DM Mono, monospace" font-size="18" font-weight="500" letter-spacing="2">${escapeXml(campaign.campaign.label)}</text>
	<text x="1150" y="62" fill="${campaign.theme.paper}" font-family="DM Mono, monospace" font-size="22" text-anchor="end">${escapeXml(campaign.event.dateShort)} / ${escapeXml(campaign.event.location.toUpperCase())}</text>
	<text x="1150" y="96" fill="${campaign.theme.muted}" font-family="DM Mono, monospace" font-size="18" text-anchor="end">${escapeXml(campaign.event.subject.toUpperCase())}</text>

	${textLines({ lines: layout.titleLines, x: 50, y: titleY, size: layout.titleSize, lineHeight: layout.lineHeight, family: "Anton, sans-serif", fill: campaign.theme.paper, weight: 700 })}

	<rect x="${portrait.left + 25}" y="${portrait.top + portrait.height - 46}" width="${portrait.width - 50}" height="30" fill="${card.accent}"/>
	<text x="${portrait.left + portrait.width / 2}" y="${portrait.top + portrait.height - 24}" fill="${campaign.theme.ink}" font-family="DM Mono, monospace" font-size="17" font-weight="500" text-anchor="middle">${escapeXml(campaign.campaign.label)}</text>

	<line x1="50" y1="463" x2="800" y2="463" stroke="${card.accent}" stroke-width="4"/>
	<text x="50" y="535" fill="${campaign.theme.paper}" font-family="Anton, sans-serif" font-size="${speakerSize}" font-weight="700">${escapeXml(displayedNames)}</text>
	<text x="54" y="580" fill="${card.accent}" font-family="DM Mono, monospace" font-size="25" font-weight="500" letter-spacing="2">${escapeXml(card.company.toUpperCase())}</text>
	<text x="1150" y="584" fill="${campaign.theme.paper}" font-family="DM Mono, monospace" font-size="22" text-anchor="end">${escapeXml(campaign.event.displayUrl)}</text>
</svg>`;
};

const portraitFor = async (speaker, width, height) => {
	const portraitSource = sharp(path.resolve(root, speaker.portrait));
	if (speaker.crop) portraitSource.extract(speaker.crop);

	return portraitSource
		.resize(width, height, { fit: "cover", position: speaker.position ?? "centre" })
		.grayscale()
		.linear(1.08, -6)
		.png()
		.toBuffer();
};

const measureText = async ({ text, size, family, weight = 400, letterSpacing = 0 }) => {
	const svg = `<svg width="2000" height="300" xmlns="http://www.w3.org/2000/svg"><text x="10" y="${size * 1.4}" font-family="${family}" font-size="${size}" font-weight="${weight}" letter-spacing="${letterSpacing}">${escapeXml(text)}</text></svg>`;
	const { info } = await sharp(Buffer.from(svg)).trim().png().toBuffer({ resolveWithObject: true });
	return { width: info.width, height: info.height };
};

const validateGeometry = async () => {
	const displayUrl = await measureText({
		text: campaign.event.displayUrl,
		size: 22,
		family: "DM Mono",
	});
	const brandText = `${campaign.brand.prefix}${campaign.brand.highlight}${campaign.brand.suffix}`;

	for (const card of campaign.cards) {
		const displayedNames = speakerNames(card, " + ").toUpperCase();
		const checks = [
			{
				label: "X brand",
				text: brandText,
				size: 72,
				family: "Anton",
				weight: 700,
				letterSpacing: 2,
				maxWidth: 500,
			},
			{
				label: "X campaign label",
				text: campaign.campaign.label,
				size: 22,
				family: "DM Mono",
				weight: 500,
				letterSpacing: 3,
				maxWidth: 600,
			},
			{
				label: "X date and location",
				text: `${campaign.event.dateShort} / ${campaign.event.location.toUpperCase()}`,
				size: 24,
				family: "DM Mono",
				maxWidth: 550,
			},
			{
				label: "X subject",
				text: campaign.event.subject.toUpperCase(),
				size: 21,
				family: "DM Mono",
				maxWidth: 450,
			},
			...card.layouts.x.titleLines.map((text) => ({
				label: "X title",
				text,
				size: card.layouts.x.titleSize,
				family: "Anton",
				weight: 700,
				maxWidth: 650,
			})),
			...card.layouts.x.summaryLines.map((text) => ({
				label: "X summary",
				text,
				size: 34,
				family: "DM Mono",
				weight: 500,
				maxWidth: 610,
			})),
			{
				label: "X photo label",
				text: campaign.campaign.label,
				size: 20,
				family: "DM Mono",
				weight: 500,
				maxWidth: 280,
			},
			{
				label: "X speaker name",
				text: displayedNames,
				size: card.layouts.x.speakerSize ?? 88,
				family: "Anton",
				weight: 700,
				maxWidth: 1068,
			},
			{
				label: "X company",
				text: card.company.toUpperCase(),
				size: 32,
				family: "DM Mono",
				weight: 500,
				letterSpacing: 3,
				maxWidth: 700,
			},
			{
				label: "X venue",
				text: campaign.event.venueShort,
				size: 28,
				family: "DM Mono",
				maxWidth: 520,
			},
			{
				label: "X URL",
				text: campaign.event.displayUrl,
				size: 28,
				family: "DM Mono",
				maxWidth: 550,
			},
			{
				label: "LinkedIn brand",
				text: brandText,
				size: 54,
				family: "Anton",
				weight: 700,
				letterSpacing: 2,
				maxWidth: 500,
			},
			{
				label: "LinkedIn campaign label",
				text: campaign.campaign.label,
				size: 18,
				family: "DM Mono",
				weight: 500,
				letterSpacing: 2,
				maxWidth: 600,
			},
			{
				label: "LinkedIn date and location",
				text: `${campaign.event.dateShort} / ${campaign.event.location.toUpperCase()}`,
				size: 22,
				family: "DM Mono",
				maxWidth: 500,
			},
			{
				label: "LinkedIn subject",
				text: campaign.event.subject.toUpperCase(),
				size: 18,
				family: "DM Mono",
				maxWidth: 400,
			},
			...card.layouts.linkedin.titleLines.map((text) => ({
				label: "LinkedIn title",
				text,
				size: card.layouts.linkedin.titleSize,
				family: "Anton",
				weight: 700,
				maxWidth: 750,
			})),
			{
				label: "LinkedIn speaker name",
				text: displayedNames,
				size: card.layouts.linkedin.speakerSize ?? 64,
				family: "Anton",
				weight: 700,
				maxWidth: 750,
			},
			{
				label: "LinkedIn photo label",
				text: campaign.campaign.label,
				size: 17,
				family: "DM Mono",
				weight: 500,
				maxWidth: 240,
			},
		];

		for (const check of checks) {
			const measured = await measureText(check);
			if (measured.width > check.maxWidth) {
				throw new Error(
					`${speakerNames(card)}'s ${check.label} is ${measured.width}px wide; maximum is ${check.maxWidth}px`,
				);
			}
		}

		const xLayout = card.layouts.x;
		const xTitleY = xLayout.titleSize >= 76 ? 265 : 235;
		const xTitleBottom = xTitleY + (xLayout.titleLines.length - 1) * xLayout.lineHeight;
		const xSummaryY = xTitleBottom + 90;
		const xSummaryBottom = xSummaryY + (xLayout.summaryLines.length - 1) * 52;
		if (xLayout.summaryLines.length && xSummaryBottom > 880) {
			throw new Error(`${speakerNames(card)}'s X copy exceeds its vertical region`);
		}
		if (xTitleY - xLayout.titleSize * 0.7 < 175) {
			throw new Error(`${speakerNames(card)}'s X title overlaps the header`);
		}

		const linkedInLayout = card.layouts.linkedin;
		const linkedInTitleBottom =
			190 + (linkedInLayout.titleLines.length - 1) * linkedInLayout.lineHeight;
		if (linkedInTitleBottom > 420) {
			throw new Error(`${speakerNames(card)}'s LinkedIn title exceeds its vertical region`);
		}
		if (190 - linkedInLayout.titleSize * 0.7 < 130) {
			throw new Error(`${speakerNames(card)}'s LinkedIn title overlaps the header`);
		}

		const company = await measureText({
			text: card.company.toUpperCase(),
			size: 25,
			family: "DM Mono",
			weight: 500,
			letterSpacing: 2,
		});
		if (54 + company.width + 40 > 1150 - displayUrl.width) {
			throw new Error(`${speakerNames(card)}'s LinkedIn company overlaps the event URL`);
		}

		const xVenue = await measureText({
			text: campaign.event.venueShort,
			size: 28,
			family: "DM Mono",
		});
		const xUrl = await measureText({
			text: campaign.event.displayUrl,
			size: 28,
			family: "DM Mono",
		});
		if (70 + xVenue.width + 40 > 1138 - xUrl.width) {
			throw new Error(`${speakerNames(card)}'s X venue overlaps the event URL`);
		}
	}
};

const renderCard = async ({ card, platform }) => {
	const isX = platform === "x";
	const width = 1200;
	const height = isX ? 1200 : 627;
	const portrait = portraitGeometry(card, platform);
	const speakerWidth = Math.floor(portrait.width / card.speakers.length);
	const portraits = await Promise.all(
		card.speakers.map((speaker) => portraitFor(speaker, speakerWidth, portrait.height)),
	);
	const background = makeBackground({
		width,
		height,
		accent: card.accent,
		watermarkSize: isX ? 390 : 270,
		watermarkY: isX ? 965 : 610,
	});
	const overlay = isX
		? makeXOverlay(card, portrait)
		: makeLinkedInOverlay(card, portrait);

	await sharp(Buffer.from(background))
		.composite([
			...portraits.map((input, speakerIndex) => ({
				input,
				left: portrait.left + speakerIndex * speakerWidth,
				top: portrait.top,
			})),
			{ input: Buffer.from(overlay), left: 0, top: 0 },
		])
		.png({ compressionLevel: 9 })
		.toFile(path.join(generationDirectory, platform, `${card.slug}.png`));
};

const makeCopyDocument = () => {
	const sections = campaign.cards.map((card) => {
		const xCopy = makeXCopy(card);
		const linkedInCopy = makeLinkedInCopy(card);
		const names = speakerNames(card);
		const portraitDescription =
			card.speakers.length === 1 ? "a black-and-white portrait" : "black-and-white portraits";
		const titleKind = card.officialTitle === false ? "editorial headline" : "talk title";
		const summaryDescription = card.summary
			? ` It summarizes the talk as: "${card.summary}"`
			: "";
		const xAlt = `Square ${campaign.event.name} ${campaign.campaign.label.toLowerCase()} card for ${names} of ${card.company}. The card shows ${portraitDescription}, a cream-colored ${titleKind} that reads "${card.title}" and ${card.accentName} accents on a black background.${summaryDescription} ${campaign.event.date} in ${campaign.event.location}.`;
		const linkedInAlt = `Landscape ${campaign.event.name} ${campaign.campaign.label.toLowerCase()} card for ${names} of ${card.company}. The card shows ${portraitDescription}, a cream-colored ${titleKind} that reads "${card.title}" and ${card.accentName} accents on a black background. ${campaign.event.date} in ${campaign.event.location}.`;
		if (xAlt.length > 1000) {
			throw new Error(`${names}'s X alt text exceeds 1,000 characters`);
		}

		return `## ${names} / ${card.company}

### X (${xMetrics(xCopy).weightedLength}/280 weighted characters)

${xCopy}

**Image:** \`x/${card.slug}.png\`

**Alt text:** ${xAlt}

### LinkedIn (${linkedInCopy.length}/3,000 characters)

${linkedInCopy}

**Image:** \`linkedin/${card.slug}.png\`

**Alt text:** ${linkedInAlt}`;
	});

	return `# ${campaign.event.name} ${campaign.campaign.name}

Generated from \`${campaignFile}\`. Copy includes platform-specific limits and hashtag counts.

${sections.join("\n\n---\n\n")}
`;
};

await validateCampaign();
await validateGeometry();

const markerPath = path.join(outputDirectory, markerName);
const outputEntry = await lstat(outputDirectory).catch((error) => {
	if (error.code === "ENOENT") return null;
	throw error;
});
if (outputEntry?.isSymbolicLink()) {
	throw new Error("Campaign outputDirectory cannot be a symbolic link");
}
const outputExists = Boolean(outputEntry);

if (outputExists) {
	const marker = JSON.parse(
		await readFile(markerPath, "utf8").catch((error) => {
			if (error.code === "ENOENT") {
				throw new Error(`Refusing to replace unowned output directory: ${campaign.outputDirectory}`);
			}
			throw error;
		}),
	);
	if (marker.campaignId !== campaign.id) {
		throw new Error(`Output directory belongs to campaign ${marker.campaignId}`);
	}
}

await rm(generationDirectory, { recursive: true, force: true });
await rm(backupDirectory, { recursive: true, force: true });
await Promise.all([
	mkdir(path.join(generationDirectory, "x"), { recursive: true }),
	mkdir(path.join(generationDirectory, "linkedin"), { recursive: true }),
]);

try {
	await Promise.all(
		campaign.cards.flatMap((card) => [
			renderCard({ card, platform: "x" }),
			renderCard({ card, platform: "linkedin" }),
		]),
	);

	await Promise.all([
		writeFile(path.join(generationDirectory, "copy.md"), makeCopyDocument()),
		writeFile(
			path.join(generationDirectory, markerName),
			`${JSON.stringify({ campaignId: campaign.id, generator: "scripts/generate-social-campaign.mjs" }, null, 2)}\n`,
		),
	]);

	if (outputExists) await rename(outputDirectory, backupDirectory);
	try {
		await rename(generationDirectory, outputDirectory);
	} catch (error) {
		if (outputExists) await rename(backupDirectory, outputDirectory);
		throw error;
	}
	await rm(backupDirectory, { recursive: true, force: true });
} catch (error) {
	await rm(generationDirectory, { recursive: true, force: true });
	throw error;
}

console.log(
	`Generated ${campaign.cards.length} cards for X and LinkedIn in ${path.relative(root, outputDirectory)}`,
);
