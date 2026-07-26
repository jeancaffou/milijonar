export default class SearchIndex {
  data() {
    return {
      permalink: "/assets/search-index.json",
      eleventyExcludeFromCollections: true,
    };
  }

  render({ catalog }) {
    return JSON.stringify({ version: 1, records: catalog.searchRecords });
  }
}
