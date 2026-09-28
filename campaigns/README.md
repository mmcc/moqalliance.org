# Social campaigns

Each campaign is a JSON manifest containing event details, campaign copy rules,
theme colors, and card data. The generator produces platform-specific images,
post copy, and alt text from that manifest.

Generate the DEMOQED speaker campaign:

```sh
npm run generate:social
```

Generate any campaign manifest:

```sh
npm run generate:campaign -- campaigns/example.json
```

To start another campaign, copy `demoqed-2026-speakers.json`, change its `id`,
`outputDirectory`, event details, and cards, then run the generic command. Each
card can set its portrait crop, accent, title, summary, and line breaks for the
X and LinkedIn layouts.

## Formats

- X: 1200x1200 PNG. X displays organic images from 2:1 through 3:4 in full, so
  1:1 uses more vertical feed space while staying inside that range. Generated
  copy is validated against the 280 weighted-character limit, counts URLs as 23
  characters, and uses no more than two hashtags.
- LinkedIn: 1200x627 PNG, LinkedIn's published recommendation for organic Page
  updates. LinkedIn does not publish a dependable organic truncation point, so
  this project keeps the opening line under 150 characters to front-load the
  speaker and event. Copy stays below the 3,000-character platform limit and
  uses three to five hashtags.

The output directory is replaced on every run so removed cards cannot remain in
the campaign by accident. The generator only replaces directories carrying a
matching ownership marker and swaps completed output into place. Generated
assets are grouped into `x/` and `linkedin/`, with post copy and alt text in
`copy.md`.

## Sources

Guidance checked September 2026:

- [X: posting photos](https://help.x.com/en/using-x/posting-gifs-and-pictures)
- [X: counting characters](https://docs.x.com/fundamentals/counting-characters)
- [X: posting links](https://help.x.com/en/using-x/how-to-post-a-link)
- [X Business: posting guidance](https://business.x.com/en/basics/get-your-business-started-with-x)
- [LinkedIn: improve your Company Page](https://www.linkedin.com/business/marketing/blog/linkedin-pages/5-non-obvious-ways-to-improve-your-linkedin-company-page)
- [LinkedIn: post character limit](https://www.linkedin.com/help/linkedin/answer/a528176)
- [LinkedIn Pages best practices](https://business.linkedin.com/marketing-solutions/linkedin-pages/best-practices)
