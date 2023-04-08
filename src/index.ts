#!/usr/bin/env node
import fs from "node:fs";
import walk from "ignore-walk";
import docx from "docx";
import {resolve} from "path";
import shiki from "shiki";
import Color from "color";
import {z} from "zod";
import {isText} from "istextorbinary";
import readline from "readline";

const configSchema = z.object({
	fileTypes: z.tuple([
		z.string(),
		z.string().optional().or(z.record(z.any())),
	]).array().default([]),
	shikiTheme: z.string().default("light-plus"),
	tabWidth: z.number().default(2),
	continuous: z.boolean().default(true),
	heading: z.object({
		font: z.string().default("Calibri Light"),
		type: z.enum([
			"heading1",
			"heading2",
			"heading3",
			"heading4",
			"heading5",
			"heading6",
		]).default("heading1"),
	}).default({}),
	code: z.object({
		font: z.string().default("Consolas"),
		size: z.number().default(11),
	}).default({}),
}).default({});

if (process.argv[2] === "--help") {
	console.log(`
Usage: code2docx [directory]

For more information on configuration, see https://github.com/sohcah/code2docx
`.trim());
	process.exit(0);
}

const defaultConfig = configSchema.parse(undefined);

const directory = process.argv[2] ?? process.cwd();

async function run() {


	fs.writeFileSync(resolve(directory, ".tmp_code2docxignore"), `
.git/
.gitattributes
.gitignore
.code2docxignore
.code2docx.json
.tmp_code2docxignore
*.docx
.DS_Store
`)

	const files = walk.sync({
		path: directory,
		ignoreFiles: [".gitignore", ".code2docxignore", ".tmp_code2docxignore"],
	})

	fs.rmSync(resolve(directory, ".tmp_code2docxignore"))

	console.info(`Found ${files.length} files in ${directory}`);

	const sections: docx.ISectionOptions[] = [];

	const configFilePath = resolve(directory, ".code2docx.json");
	const configFile = fs.existsSync(configFilePath) ? JSON.parse(fs.readFileSync(configFilePath, "utf8")) : undefined;

	const config = configSchema.parse(configFile);

	const chalk = (await import("chalk-template")).default;

	console.log(chalk`
{yellow.underline Config}
{${defaultConfig.shikiTheme === config.shikiTheme ? "gray" : "blue"} Theme: ${config.shikiTheme}}
{${defaultConfig.tabWidth === config.tabWidth ? "gray" : "blue"} Tab width: ${config.tabWidth}}
{${defaultConfig.continuous === config.continuous ? "gray" : "blue"} Continuous: ${config.continuous}}
{gray Heading: }
{${defaultConfig.heading.font === config.heading.font ? "gray" : "blue"}   Font: ${config.heading.font}}
{${defaultConfig.heading.type === config.heading.type ? "gray" : "blue"}   Type: ${config.heading.type}}
{gray Code: }
{${defaultConfig.code.font === config.code.font ? "gray" : "blue"}   Font: ${config.code.font}}
{${defaultConfig.code.size === config.code.size ? "gray" : "blue"}   Size: ${config.code.size}}
`.trim())

	const initialFileMappings: [RegExp, string | { id: string; scopeName: string; path: string; } | undefined][] = [
		...config.fileTypes.map(([regex, language]) => {
			const parsedRegex = regex.startsWith("/") ? new RegExp(regex.slice(1, -1)) : new RegExp(`\\.${regex}$`);
			if (language && typeof language === "object") {
				const id = `code2docx-${Math.random().toString(36).slice(2)}`;
				return [parsedRegex, {
					id,
					scopeName: language.scopeName,
					path: resolve(process.cwd(), language.path),
				}] as [RegExp, {
					id: string;
					scopeName: string;
					path: string;
				}];
			}
			return [parsedRegex, language] as [RegExp, string | undefined];
		}),
		[/\.jsx?$/, "javascript"],
		[/\.tsx?$/, "typescript"],
		[/\.json$/, "json"],
		[/\.css$/, "css"],
		[/\.ya?ml$/, "yaml"],
		[/\.html$/, "html"],
		[/\.md$/, "markdown"],
		[/\.py$/, "python"],
		[/\.sql$/, "sql"],
		[/yarn\.lock$/, "json"],
		[/nginx\.conf$/, "nginx"],
		[/\.prisma$/, "prisma"],
	]

	const highlighter = await shiki.getHighlighter({
		theme: config.shikiTheme,
		langs: [
			...shiki.BUNDLED_LANGUAGES,
			...initialFileMappings.filter(i => typeof i[1] !== "string").map(i => i[1]) as {
				id: string;
				scopeName: string;
				path: string;
			}[]
		],
	});

	const fileMappings = initialFileMappings.map(([regex, language]) => {
		if (!language || typeof language === "string") {
			return [regex, language] as [RegExp, string];
		}
		return [regex, language.id] as [RegExp, string | undefined];
	});

	let fileIndex = 0;
	for (const file of files) {
		if (!isText(file)) {
			if (await new Promise(resolve => {
				const rl = readline.createInterface({
					input: process.stdin,
					output: process.stdout,
				});
				rl.question(`Skip possibly binary file ${file}? (y/n) `, (answer: string) => {
					resolve(answer === "y");
					rl.close();
				});
			})) {
				console.log("Skipping binary file", file);
				continue;
			}
		}
		console.log(`Processing ${file}...`);
		const fileContent = fs.readFileSync(resolve(directory, file), "utf8");
		const fileMapping = fileMappings.find(([regex]) => regex.test(file));
		const tokens = highlighter.codeToThemedTokens(fileContent, fileMapping?.[1]);
		sections.push({
			properties: {
				type: config.continuous ? docx.SectionType.CONTINUOUS : undefined,
				page: {
					margin: {
						top: 720,
						right: 720,
						bottom: 720,
						left: 720,
					}
				}
			},
			children: [
				// title
				new docx.Paragraph({
					children: [
						new docx.TextRun({
							text: file,
							font: {
								name: config.heading.font,
							},
							break: config.continuous && fileIndex !== 0 ? 1 : 0,
						})
					],
					heading: docx.HeadingLevel[{
						heading1: "HEADING_1" as const,
						heading2: "HEADING_2" as const,
						heading3: "HEADING_3" as const,
						heading4: "HEADING_4" as const,
						heading5: "HEADING_5" as const,
						heading6: "HEADING_6" as const,
					}[config.heading.type]],
				}),
				// code
				new docx.Paragraph({
					shading: {
						type: docx.ShadingType.SOLID,
						color: Color(highlighter.getBackgroundColor()).hex(),
					},
					children: [
						...tokens.flatMap((line, lineIndex) => (
								line.length === 0 ? [
										new docx.TextRun({
											text: "",
											break: 1,
										})
									] :
									line.map((token, index) => (
											new docx.TextRun({
												text: token.content.replace(/\t/g, " ".repeat(config.tabWidth)),
												color: token.color ? Color(token.color)
													.hex() : Color(highlighter.getForegroundColor()).hex(),
												break: index === 0 && lineIndex !== 0 ? 1 : 0,
												font: {
													name: config.code.font,
												},
												size: config.code.size * 2,
											})
										)
									)
							)
						)
					],
				}),
			],
		});
		fileIndex++;
	}
	const doc = new docx.Document({
		sections,
	});

	console.log("Writing code2docx.docx...");

	const buffer = await docx.Packer.toBuffer(doc)
	fs.writeFileSync(resolve(directory, "code2docx.docx"), buffer);

	console.log("Done!");

}

run();
