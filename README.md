# CodeToDoc

### Install

```bash
npm i -g @sohcah/code-to-doc
```

### Usage

```bash
code-to-doc [folder]
```

### Configuration

#### Ignore Files

CodeToDoc will ignore all files listed in your `.gitignore`.

If you want to ignore files only for CodeToDoc, you can create a `.codetodocignore` file with the same syntax as a `.gitignore`.

#### Other Configuration

You can create a `.codetodoc.json` configuration file in your project root.

An example is below:

```json
{
  "shikiTheme": "nord",
  "fileTypes": [
    ["xml", "xml"],
    ["/yarn\\.lock$/", "yaml"]
  ],
  "tabWidth": 4
}
```
