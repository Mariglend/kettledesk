# Contributing

Thanks for helping. Bug reports, fixes, translations and ideas are all welcome.

## Reporting a bug

Open an issue with what you did, what you expected and what happened. Screenshots help.
Please remove any real client data from screenshots and files before attaching them.

## Development

```bash
npm install
npm start
```

The interface is plain JavaScript without a framework or build step: edit a file in `js/` and reload the window (Ctrl+R).
Code comments are in Italian; English is fine for new code and pull requests.

Before opening a pull request:

- run `npm run i18n:check` if you touched any text;
- try the flows you changed in at least one language other than Italian.

## Writing interface text

All text the user sees goes through the translation helpers in `js/i18n.js`. The Italian text itself is the key:

```js
t('Nuovo cliente')                                  // simple text
t('Scade il {date}', {date: fmtDate(p.expiryDate)}) // values in curly braces
tp(n, '1 lezione rimasta', '{n} lezioni rimaste')   // singular / plural
N_('Oggi')                                          // mark text that is translated later with t()
```

Keys must be plain string literals, so the checker can find them. After adding or changing text, add the translation to every file in `js/i18n/` (English at least; the checker lists what is missing).

Format dates, numbers and money with `fmtDate`, `fmtTime`, `numText` and `eur`: they follow the selected language and currency.

## Improving or adding a translation

Translation files are in `js/i18n/`, one per language. Each entry maps the Italian text to the translation:

```js
"Nuovo cliente": "New client",
"Scade il {date}": "Expires on {date}",
```

- Keep placeholders such as `{n}` or `{date}` exactly as they are, and keep HTML tags such as `<b>…</b>`.
- Use the tone already used in that file (for example informal in German and Spanish, formal in French and Portuguese).
- Run `npm run i18n:check`: it reports missing keys, unused keys and placeholders that don't match.

To add a new language:

1. copy `js/i18n/en.js` to `js/i18n/<code>.js`, change `I18N.en` to `I18N.<code>` and translate the values;
2. add the language to `LANGS` in `js/i18n.js` (name, locale for dates and numbers, default phone prefix);
3. add `<script src="js/i18n/<code>.js"></script>` in `index.html`, next to the other languages;
4. add the few messages of the main process to `MSG` in `main.js`.

Right-to-left languages are not supported yet.
