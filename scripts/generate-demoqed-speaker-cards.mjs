import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetDirectory = path.join(root, "public", "demoqed-2026");
const outputDirectory = path.join(assetDirectory, "social");
const fontDirectory = path.join(root, "scripts", "fonts");

process.env.FONTCONFIG_FILE = "fonts.conf";
process.env.FONTCONFIG_PATH = fontDirectory;

const { default: sharp } = await import("sharp");

const speakers = [
	{
		slug: "luke-curley",
		name: "Luke Curley",
		company: "moq.pro",
		accent: "#20e58a",
		accentName: "bright green",
		displayTitle: "How to hand draw your slides (and something something MoQ)",
		summaryText: "Hand-drawn slides, plus something something MoQ. You'll have to be there.",
		titleSize: 62,
		lineHeight: 64,
		title: [
			"HOW TO HAND",
			"DRAW YOUR SLIDES",
			"(AND SOMETHING",
			"SOMETHING MOQ)",
		],
		summary: ["HAND-DRAWN SLIDES.", "SOMETHING SOMETHING MOQ.", "YOU'LL HAVE TO BE THERE."],
	},
	{
		slug: "vanessa-pyne",
		name: "Vanessa Pyne",
		company: "Daily",
		accent: "#22b7f2",
		accentName: "bright blue",
		displayTitle: "Do you even bench bro? - Livestreaming a LaserDisc to benchmark MoQ vs HLS",
		summaryText: "A LaserDisc livestreamed from New Orleans to San Francisco benchmarks Media over QUIC against HLS.",
		titleSize: 58,
		lineHeight: 60,
		title: [
			"DO YOU EVEN",
			"BENCH BRO?",
			"LIVESTREAMING A",
			"LASERDISC TO",
			"BENCHMARK MOQ",
			"VS HLS",
		],
		summary: [
			"A LASERDISC LIVESTREAMED",
			"FROM NEW ORLEANS TO",
			"SAN FRANCISCO BENCHMARKS",
			"MEDIA OVER QUIC AGAINST HLS.",
		],
	},
	{
		slug: "will-law",
		name: "Will Law",
		company: "Akamai Technologies",
		accent: "#a477ff",
		accentName: "bright purple",
		displayTitle: "I'm streaming MoQ - huh?",
		summaryText: "Why payload-agnostic MOQT still needs media formats, with MSF, CMSF, and working player demos.",
		titleSize: 82,
		lineHeight: 84,
		title: ["I'M STREAMING", "MOQ - HUH?"],
		summary: [
			"WHY PAYLOAD-AGNOSTIC MOQT",
			"STILL NEEDS MEDIA FORMATS,",
			"WITH MSF, CMSF, AND WORKING",
			"PLAYER DEMOS.",
		],
	},
	{
		slug: "aman-sharma",
		name: "Aman Sharma",
		company: "Meta",
		accent: "#ff4b9b",
		accentName: "bright pink",
		displayTitle: "Moving Instagram and Facebook Live to MoQ",
		summaryText: "How Meta is moving Instagram and Facebook Live from its proprietary RUSH protocol to Media over QUIC.",
		titleSize: 58,
		lineHeight: 63,
		title: ["MOVING INSTAGRAM", "AND FACEBOOK LIVE", "TO MOQ"],
		summary: [
			"HOW META IS MOVING",
			"INSTAGRAM AND FACEBOOK LIVE",
			"FROM ITS PROPRIETARY RUSH",
			"PROTOCOL TO MEDIA OVER QUIC.",
		],
	},
	{
		slug: "alan-frindell",
		name: "Alan Frindell",
		company: "Atomic Quokka",
		accent: "#ff7b2e",
		accentName: "bright orange",
		crop: { left: 130, top: 0, width: 220, height: 290 },
		displayTitle: "Scaling the OpenMOQ moqx relay",
		summaryText: "How the OpenMOQ moqx relay scales fan-out efficiently across multiple CPU cores.",
		titleSize: 76,
		lineHeight: 78,
		title: ["SCALING THE", "OPENMOQ MOQX", "RELAY"],
		summary: [
			"HOW THE OPENMOQ MOQX RELAY",
			"SCALES FAN-OUT EFFICIENTLY",
			"ACROSS MULTIPLE CPU CORES.",
		],
	},
];

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

const makeBackground = (accent) => `
<svg width="1200" height="1200" viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg">
	<defs>
		<radialGradient id="glow" cx="78%" cy="38%" r="68%">
			<stop offset="0" stop-color="${accent}" stop-opacity="0.18"/>
			<stop offset="0.48" stop-color="#14121a" stop-opacity="0.7"/>
			<stop offset="1" stop-color="#08070a"/>
		</radialGradient>
		<pattern id="lines" width="42" height="42" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
			<line x1="0" y1="0" x2="0" y2="42" stroke="#efe9dd" stroke-opacity="0.025" stroke-width="2"/>
		</pattern>
	</defs>
	<rect width="1200" height="1200" fill="#08070a"/>
	<rect width="1200" height="1200" fill="url(#glow)"/>
	<rect width="1200" height="1200" fill="url(#lines)"/>
	<circle cx="1160" cy="60" r="250" fill="none" stroke="${accent}" stroke-opacity="0.12" stroke-width="70"/>
	<text x="1190" y="965" fill="#efe9dd" fill-opacity="0.025" font-family="Anton, sans-serif" font-size="390" font-weight="700" text-anchor="end">MOQ</text>
</svg>`;

const makeOverlay = (speaker, index) => {
	const titleY = speaker.titleSize >= 80 ? 325 : 285;
	const titleBottom = titleY + (speaker.title.length - 1) * speaker.lineHeight;
	const summaryY = Math.max(630, titleBottom + 88);

	return `
<svg width="1200" height="1200" viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg">
	<rect x="760" y="200" width="380" height="500" fill="none" stroke="${speaker.accent}" stroke-width="6"/>
	<path d="M742 184H1124" stroke="${speaker.accent}" stroke-width="3"/>
	<path d="M1142 216V684" stroke="#efe9dd" stroke-opacity="0.55" stroke-width="2"/>

	<text x="70" y="96" font-family="Anton, sans-serif" font-size="72" font-weight="700" letter-spacing="2">
		<tspan fill="#efe9dd">DE</tspan><tspan fill="${speaker.accent}">MOQ</tspan><tspan fill="#efe9dd">ED</tspan>
	</text>
	<text x="72" y="143" fill="${speaker.accent}" font-family="DM Mono, monospace" font-size="22" font-weight="500" letter-spacing="3">SPEAKER ANNOUNCEMENT / ${String(index + 1).padStart(2, "0")}</text>
	<text x="1138" y="92" fill="#efe9dd" font-family="DM Mono, monospace" font-size="24" text-anchor="end" letter-spacing="1">OCT 8, 2026 / SAN FRANCISCO</text>
	<text x="1138" y="132" fill="#8c8791" font-family="DM Mono, monospace" font-size="21" text-anchor="end" letter-spacing="1">MEDIA OVER QUIC</text>

	<text x="70" y="226" fill="${speaker.accent}" font-family="DM Mono, monospace" font-size="20" font-weight="500" letter-spacing="4">THE TALK</text>
	${textLines({ lines: speaker.title, x: 70, y: titleY, size: speaker.titleSize, lineHeight: speaker.lineHeight, family: "Anton, sans-serif", fill: "#efe9dd", weight: 700 })}

	<line x1="70" y1="${summaryY - 39}" x2="680" y2="${summaryY - 39}" stroke="${speaker.accent}" stroke-width="4"/>
	${textLines({ lines: speaker.summary, x: 70, y: summaryY, size: 34, lineHeight: 52, family: "DM Mono, monospace", fill: "#c5c0c8", weight: 500 })}

	<rect x="800" y="644" width="300" height="36" fill="${speaker.accent}"/>
	<text x="950" y="670" fill="#08070a" font-family="DM Mono, monospace" font-size="23" font-weight="500" text-anchor="middle" letter-spacing="1">SPEAKER ANNOUNCEMENT</text>

	<line x1="70" y1="932" x2="1138" y2="932" stroke="#efe9dd" stroke-opacity="0.25" stroke-width="2"/>
	<text x="70" y="1036" fill="#efe9dd" font-family="Anton, sans-serif" font-size="88" font-weight="700" letter-spacing="1">${escapeXml(speaker.name.toUpperCase())}</text>
	<text x="74" y="1090" fill="${speaker.accent}" font-family="DM Mono, monospace" font-size="32" font-weight="500" letter-spacing="3">${escapeXml(speaker.company.toUpperCase())}</text>
	<text x="70" y="1150" fill="#8c8791" font-family="DM Mono, monospace" font-size="28">ALAMO DRAFTHOUSE / SF</text>
	<text x="1138" y="1150" fill="#efe9dd" font-family="DM Mono, monospace" font-size="28" text-anchor="end">MOQALLIANCE.ORG/DEMOQED-2026</text>
</svg>`;
};

await mkdir(outputDirectory, { recursive: true });

const existingFiles = await readdir(outputDirectory);
await Promise.all(
	existingFiles
		.filter((file) => file.endsWith(".png"))
		.map((file) => rm(path.join(outputDirectory, file))),
);

for (const [index, speaker] of speakers.entries()) {
	const portraitSource = sharp(path.join(assetDirectory, `${speaker.slug}.webp`));
	if (speaker.crop) portraitSource.extract(speaker.crop);

	const portrait = await portraitSource
		.resize(380, 500, {
			fit: "cover",
			position: "centre",
		})
		.grayscale()
		.linear(1.08, -6)
		.png()
		.toBuffer();

	await sharp(Buffer.from(makeBackground(speaker.accent)))
		.composite([
			{ input: portrait, left: 760, top: 200 },
			{ input: Buffer.from(makeOverlay(speaker, index)), left: 0, top: 0 },
		])
		.png({ compressionLevel: 9 })
		.toFile(path.join(outputDirectory, `${speaker.slug}.png`));
}

const socialCopy = speakers
	.map(
		(speaker) => `${speaker.name} / ${speaker.company}

POST COPY
Speaker announcement: ${speaker.name} of ${speaker.company} is joining DEMOQED in San Francisco.

"${speaker.displayTitle}"

${speaker.summaryText}

October 8, 2026 | Alamo Drafthouse
https://moqalliance.org/demoqed-2026

ALT TEXT
Square DEMOQED speaker card for ${speaker.name} of ${speaker.company}. The card shows a black-and-white portrait, a cream-colored talk title that reads "${speaker.displayTitle}" and ${speaker.accentName} accents on a black background. October 8, 2026 in San Francisco.`,
	)
	.join("\n\n------------------------------------------------------------\n\n");

await writeFile(path.join(outputDirectory, "copy.txt"), `${socialCopy}\n`);

console.log(`Generated ${speakers.length} cards in ${path.relative(root, outputDirectory)}`);
