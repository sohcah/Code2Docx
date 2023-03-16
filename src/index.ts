#!/usr/bin/env node
import fs from "node:fs";
import walk from "ignore-walk";
import docx from "docx";
import {resolve} from "path";
import shiki from "shiki";
import Color from "color";
import {z} from "zod";
import {isText} from "istextorbinary";

const directory = process.argv[2] ?? process.cwd();

async function run() {


	fs.writeFileSync(resolve(directory, ".tmp_codetodocignore"), `
.git/
.gitattributes
.gitignore
.codetodocignore
.codetodoc.json
.tmp_codetodocignore
*.docx
.DS_Store
`)

	const files = walk.sync({
		path: directory,
		ignoreFiles: [".gitignore", ".codetodocignore", ".tmp_codetodocignore"],
	})

	fs.rmSync(resolve(directory, ".tmp_codetodocignore"))

	console.info(`Found ${files.length} files in ${directory}`);

	const sections: docx.ISectionOptions[] = [];

	const configFilePath = resolve(directory, ".codetodoc.json");
	const configFile = fs.existsSync(configFilePath) ? JSON.parse(fs.readFileSync(configFilePath, "utf8")) : undefined;

	const config = z.object({
		fileTypes: z.tuple([
			z.string(),
			z.string().optional(),
		]).array().default([]),
		shikiTheme: z.string().default("light-plus"),
		tabWidth: z.number().default(2),
	}).default({}).parse(configFile);

	console.log("Config:", config);

	const fileMappings: [RegExp, string | undefined][] = [
		...config.fileTypes.map(([regex, language]) => [regex.startsWith("/") ? new RegExp(regex.slice(1, -1)) : new RegExp(`\\.${regex}$`), language] as [RegExp, string | undefined]),
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
	});

	for (const file of files) {
		if (!isText(file)) {
			console.log("Skipping binary file", file);
			continue;
		}
		console.log(`Processing ${file}...`);
		const fileContent = fs.readFileSync(resolve(directory, file), "utf8");
		const fileMapping = fileMappings.find(([regex]) => regex.test(file));
		const tokens = highlighter.codeToThemedTokens(fileContent, fileMapping?.[1]);
		sections.push({
			children: [
				// title
				new docx.Paragraph({
					text: file,
					heading: docx.HeadingLevel.HEADING_1,
				}),
				// code
				new docx.Paragraph({
					shading: {
						type: docx.ShadingType.SOLID,
						color: Color(highlighter.getBackgroundColor()).hex(),
					},
					children: [
						...tokens
							.flatMap((line, lineIndex) => (
									line.map((token, index) => (
											new docx.TextRun({
												text: token.content.replace(/\t/g, " ".repeat(config.tabWidth)),
												color: token.color ? Color(token.color)
													.hex() : Color(highlighter.getForegroundColor()).hex(),
												break: index === 0 && lineIndex !== 0 ? 1 : 0,
												font: {
													name: "Consolas",
												},
											})
										)
									)
								)
							)
					],
				}),
			],
		});

	}
	const doc = new docx.Document({
		sections,
	});

	console.log("Writing output.docx...");

	const buffer = await docx.Packer.toBuffer(doc)
	fs.writeFileSync(resolve(directory, "output.docx"), buffer);

	console.log("Done!");

}

run();
