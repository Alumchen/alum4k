interface GenreTaxonomy { label: string; values: string[] }
const taxonomies: Record<string, GenreTaxonomy> = {
  电影: { label: "类型", values: ["动作", "喜剧", "爱情", "科幻", "恐怖", "惊悚", "犯罪", "悬疑", "剧情", "冒险", "奇幻", "战争", "历史", "家庭", "音乐", "西部"] },
  电视剧: { label: "类型", values: ["爱情", "都市", "青春", "奇幻", "武侠", "古装", "科幻", "悬疑", "犯罪", "剧情", "冒险", "喜剧", "动作", "历史", "战争"] },
  纪录片: { label: "主题", values: ["自然", "历史", "人文", "科技", "社会", "美食", "旅行", "传记", "音乐", "体育", "军事", "犯罪"] },
  综艺: { label: "节目", values: ["真人秀", "脱口秀", "音乐", "舞蹈", "喜剧", "竞技", "恋爱", "旅行", "美食", "生活", "访谈", "文化"] },
  动漫: { label: "题材", values: ["热血", "冒险", "奇幻", "科幻", "搞笑", "悬疑", "恋爱", "运动", "校园", "日常", "治愈", "机战"] },
  少儿: { label: "内容", values: ["启蒙", "益智", "科普", "儿歌", "童话", "冒险", "亲子", "教育"] },
  短剧: { label: "题材", values: ["爱情", "都市", "古装", "喜剧", "悬疑", "奇幻", "逆袭", "家庭", "青春"] },
  游戏: { label: "内容", values: ["实况", "攻略", "电竞", "赛事", "评测", "游戏纪录"] }
};
const aliases: Record<string, string[]> = {
  动作: ["action", "动作冒险", "动作与冒险", "action & adventure"],
  冒险: ["adventure", "动作冒险", "动作与冒险", "action & adventure"],
  喜剧: ["comedy", "搞笑"], 搞笑: ["comedy", "喜剧"],
  爱情: ["romance", "恋爱"], 恋爱: ["romance", "爱情"],
  科幻: ["science fiction", "sci-fi", "sci-fi & fantasy", "科幻与奇幻", "科幻奇幻"],
  奇幻: ["fantasy", "sci-fi & fantasy", "科幻与奇幻", "科幻奇幻"],
  恐怖: ["horror"], 惊悚: ["thriller"], 犯罪: ["crime", "true crime", "真实犯罪"],
  悬疑: ["mystery"], 剧情: ["drama"], 战争: ["war", "war & politics", "战争与政治"],
  历史: ["history", "historical"], 家庭: ["family"], 音乐: ["music", "musical"], 西部: ["western"],
  真人秀: ["reality", "reality show"], 脱口秀: ["talk", "talk show"],
  自然: ["nature", "wildlife", "自然生态", "动物", "野生动物"], 人文: ["humanities", "人文地理"],
  科技: ["technology", "science", "科学"], 美食: ["food", "cooking"], 旅行: ["travel", "旅游"],
  传记: ["biography", "biographical"], 体育: ["sport", "sports"], 运动: ["sport", "sports", "体育"],
  军事: ["military"], 舞蹈: ["dance"], 访谈: ["interview"], 教育: ["education", "educational"]
};
function normalizeGenre(value: string) { return value.normalize("NFKC").trim().toLowerCase().replace(/\s*&\s*/g, " & "); }
export function genreTaxonomy(category: string): GenreTaxonomy { return taxonomies[category] ?? taxonomies.电影; }
export function matchesGenre(genres: string[], value: string) {
  const names = new Set([value, ...(aliases[value] ?? [])].map(normalizeGenre));
  return genres.some((genre) => names.has(normalizeGenre(genre)));
}
export function genreOptions(category: string, items: Array<{ category: string; genres: string[] }>, selected = "全部") {
  const taxonomy = genreTaxonomy(category);
  const generic = new Set(["纪录", "纪录片", "documentary", "动画", "动漫", "animation", "儿童", "少儿", "kids"]);
  const extra = [...new Set(items.filter((item) => category === "首页" || item.category === category).flatMap((item) => item.genres).map((genre) => genre.trim()).filter((genre) => genre && !generic.has(normalizeGenre(genre)) && !taxonomy.values.some((value) => matchesGenre([genre], value))))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  return [...new Set(["全部", ...taxonomy.values, ...extra, ...(selected !== "全部" ? [selected] : [])])];
}
export function toggleGenreTag(genres: string[], value: string, enabled: boolean) {
  return enabled ? matchesGenre(genres, value) ? genres : [...genres, value] : genres.filter((genre) => !matchesGenre([genre], value));
}
