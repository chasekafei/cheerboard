// 初始来源：docs/references/xiaohongshu-handbanners-2026-10-25/最终文案/最终文案.json
// 后续手动修订以此清单的文字、分类与优先级为准。
// 保留审核后的原文。每个语义组只列一条，已选异写作为可切换的展示版本。
export const SLOGAN_CATEGORIES = ['孙颖莎', '王楚钦', '莎头', '其他'] as const;
export type SloganCategory = typeof SLOGAN_CATEGORIES[number];
export type SloganFilter = SloganCategory | '全部';
export type Slogan = {
  id: string;
  text: string;
  category: SloganCategory;
  priority: 1 | 2;
  variants: readonly string[];
};

// 2 为优先收录，1 为可用；同级保留最终清单顺序。
export const SLOGANS: readonly Slogan[] = [
  {"id": "C001", "text": "钦尽全力", "category": "王楚钦", "priority": 2, "variants": []},
  {"id": "C002", "text": "莎出重围", "category": "孙颖莎", "priority": 2, "variants": []},
  {"id": "C003", "text": "孙颖莎", "category": "孙颖莎", "priority": 2, "variants": ["Sun.Y.S.", "SunYingsha", "SUNYINGSHA", "CHINA SUN Y.S.", "Sun YingSha", "Sun Y.S.", "莎"]},
  {"id": "C004", "text": "王楚钦", "category": "王楚钦", "priority": 2, "variants": ["Wang.C.Q", "WangChuqin", "WANGCHUQIN", "钦"]},
  {"id": "C005", "text": "全力以赴", "category": "其他", "priority": 2, "variants": []},
  {"id": "C006", "text": "坚定自信", "category": "其他", "priority": 2, "variants": ["BE FIRM AND CONFIDENT", "相信自己"]},
  {"id": "C007", "text": "我们来日方长", "category": "王楚钦", "priority": 2, "variants": ["来日方长", "我们 来日方长"]},
  {"id": "C008", "text": "这么远那么贵\n为了莎头我无所谓", "category": "莎头", "priority": 2, "variants": []},
  {"id": "C009", "text": "明亮的心", "category": "孙颖莎", "priority": 2, "variants": []},
  {"id": "C010", "text": "痛苦之上是曙光", "category": "王楚钦", "priority": 2, "variants": ["Beyond pain lies the dawn.", "ABOVE THE PAIN LIES THE DAWN"]},
  {"id": "C011", "text": "今天的太阳比昨天大", "category": "孙颖莎", "priority": 2, "variants": ["The sun is bigger today than it was yesterday"]},
  {"id": "C012", "text": "健康涨球", "category": "其他", "priority": 2, "variants": []},
  {"id": "C013", "text": "5114", "category": "莎头", "priority": 2, "variants": []},
  {"id": "C014", "text": "当身体达到了极限 不屈的意志会带你杀出重围", "category": "王楚钦", "priority": 2, "variants": []},
  {"id": "C015", "text": "谁敢横刀立马 唯我莎头将军", "category": "莎头", "priority": 2, "variants": []},
  {"id": "C016", "text": "赫杯之上 你我永存", "category": "莎头", "priority": 2, "variants": []},
  {"id": "C017", "text": "如我面对太阳，如你追寻希望", "category": "莎头", "priority": 2, "variants": []},
  {"id": "C018", "text": "钦尽全力 莎出重围", "category": "莎头", "priority": 2, "variants": []},
  {"id": "C019", "text": "目标远不止于此", "category": "王楚钦", "priority": 2, "variants": []},
  {"id": "C020", "text": "Sun & Hope!!", "category": "莎头", "priority": 2, "variants": ["Sunhope", "SUNHOPE", "SUN\nHOPE", "SUN AND HOPE"]},
  {"id": "C021", "text": "顶峰相见", "category": "莎头", "priority": 2, "variants": ["少年热血，顶峰相见"]},
  {"id": "C022", "text": "HOPE", "category": "王楚钦", "priority": 2, "variants": []},
  {"id": "C023", "text": "LIONHEART", "category": "王楚钦", "priority": 2, "variants": []},
  {"id": "C024", "text": "One true king", "category": "王楚钦", "priority": 2, "variants": []},
  {"id": "C025", "text": "嚟咗廣州", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C026", "text": "乒超撐莎莎楚钦", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C027", "text": "welcome to 廣州", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C028", "text": "努力而闪耀", "category": "其他", "priority": 1, "variants": ["Glow with your effort"]},
  {"id": "C029", "text": "专注且谦逊", "category": "其他", "priority": 1, "variants": ["Stay focused, stay humble"]},
  {"id": "C030", "text": "SUN", "category": "孙颖莎", "priority": 1, "variants": ["sun"]},
  {"id": "C031", "text": "我好钟意你哋啊", "category": "莎头", "priority": 1, "variants": ["颖莎楚钦 我好喜欢你们啊"]},
  {"id": "C032", "text": "希望我哋多啲見面", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C033", "text": "新年快樂", "category": "其他", "priority": 1, "variants": []},
  {"id": "C034", "text": "你们在 幸福在", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C035", "text": "欢迎莎头嚟广州\n要乜有乜掂过碌蔗", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C036", "text": "楚钦颖莎", "category": "莎头", "priority": 1, "variants": ["莎莎楚钦", "颖莎楚钦", "SHATOU", "SUNYINGSHA&WANGCHUQIN"]},
  {"id": "C037", "text": "看你们打球好幸福", "category": "莎头", "priority": 1, "variants": ["楚钦颖莎\n看你们打球好幸福", "看你们打球 超级幸福啊", "楚钦颖莎 看你们打球好幸福"]},
  {"id": "C038", "text": "莎头加油", "category": "莎头", "priority": 1, "variants": ["FIGH\nTING", "fighting"]},
  {"id": "C039", "text": "祝中国乒乓球队\n越来越好", "category": "其他", "priority": 2, "variants": []},
  {"id": "C040", "text": "孙颖莎王楚钦\n请健康、\n请专注自身", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C041", "text": "LOVE FOR HOPE", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C042", "text": "LOVE FOR SUN", "category": "孙颖莎", "priority": 1, "variants": []},
  {"id": "C043", "text": "莎莎楚钦\n平安健康顺遂", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C044", "text": "成为榜样\n成为力量", "category": "其他", "priority": 1, "variants": []},
  {"id": "C045", "text": "向上生长", "category": "其他", "priority": 1, "variants": []},
  {"id": "C046", "text": "来！走！", "category": "其他", "priority": 1, "variants": []},
  {"id": "C047", "text": "SUN\nSHINE", "category": "孙颖莎", "priority": 1, "variants": []},
  {"id": "C048", "text": "追着光生长、成为自己的太阳", "category": "其他", "priority": 1, "variants": ["GROW TOWARD THE LIGHT\nBECOME YOUR OWN SUN"]},
  {"id": "C049", "text": "聚沙成塔、未完待续", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C050", "text": "ACCUMULATE SMALL\nAMOUNTS TO\nFORM A LARGE SUM", "category": "其他", "priority": 1, "variants": []},
  {"id": "C051", "text": "保持热爱，保持专注", "category": "其他", "priority": 1, "variants": ["专注自己的热爱"]},
  {"id": "C052", "text": "感谢你成为孙颖莎", "category": "孙颖莎", "priority": 1, "variants": []},
  {"id": "C053", "text": "保持热爱\n全力以赴", "category": "其他", "priority": 1, "variants": []},
  {"id": "C054", "text": "不管几岁\n开心万岁", "category": "其他", "priority": 1, "variants": []},
  {"id": "C055", "text": "生日快乐", "category": "其他", "priority": 1, "variants": ["孙颖莎\n生日快乐", "Happy Birthday", "生日快乐～", "HAPPY BIRTHDAY\n生日快乐", "HAPPY BIRTHDAY"]},
  {"id": "C056", "text": "孙颖莎\n你皮紧一点", "category": "孙颖莎", "priority": 1, "variants": []},
  {"id": "C057", "text": "王楚钦\n你皮紧一点", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C058", "text": "如果全世界都指责你\n那我带你去见莎头", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C059", "text": "这么顶那么稳\n看莎头我很心安", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C060", "text": "你们说球场见\n于是我又来了", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C061", "text": "奔向太阳", "category": "孙颖莎", "priority": 1, "variants": []},
  {"id": "C062", "text": "镌刻的是我们的八年", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C063", "text": "1104", "category": "孙颖莎", "priority": 1, "variants": ["2000.11.04"]},
  {"id": "C064", "text": "Keep Shining", "category": "孙颖莎", "priority": 1, "variants": []},
  {"id": "C065", "text": "赢到他们\n习惯为止", "category": "孙颖莎", "priority": 1, "variants": ["WIN UNTIL THEY GET USED TO IT"]},
  {"id": "C066", "text": "王楚钦加油 享受比赛", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C067", "text": "队长", "category": "王楚钦", "priority": 1, "variants": ["中国乒乓球男队队长", "CAPTAIN KING"]},
  {"id": "C068", "text": "竭尽全力永不言弃", "category": "其他", "priority": 1, "variants": []},
  {"id": "C069", "text": "快乐乒乓", "category": "其他", "priority": 1, "variants": []},
  {"id": "C070", "text": "0511", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C071", "text": "乒乓世界迷人眼，最爱莎莎小圆脸", "category": "孙颖莎", "priority": 1, "variants": []},
  {"id": "C072", "text": "ALL FOR SYS", "category": "孙颖莎", "priority": 1, "variants": []},
  {"id": "C073", "text": "王楚钦你最棒，赛场拼搏放光芒", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C074", "text": "ALL FOR WCQ", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C075", "text": "莎莎吃面包吗", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C076", "text": "他说她是天才", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C077", "text": "拥有你们就拥有全世界", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C078", "text": "钦听幸福的声音会上颖", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C079", "text": "养只猫猫叫耶耶", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C080", "text": "你告诉他们我叫小豆包", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C081", "text": "一颗真心足矣", "category": "其他", "priority": 1, "variants": []},
  {"id": "C082", "text": "美丽的夜景", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C083", "text": "愛是两颗相擁的透明心臓", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C084", "text": "我们心脏同频 始终共振", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C085", "text": "東京的雨淋不濕巴黎", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C086", "text": "家有万分双世一💭🤍", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C087", "text": "颤抖的镜头是我呼之欲出的心跳", "category": "其他", "priority": 1, "variants": []},
  {"id": "C088", "text": "他们质疑真心 那我就用真心换真心", "category": "其他", "priority": 1, "variants": []},
  {"id": "C089", "text": "这一次 场馆中也有了我的呐喊声", "category": "其他", "priority": 1, "variants": []},
  {"id": "C090", "text": "想用手机记录你 又怕眼睛错过你", "category": "其他", "priority": 1, "variants": []},
  {"id": "C091", "text": "邓布利多 你说的对 爱是世界上最伟大的魔法", "category": "其他", "priority": 1, "variants": []},
  {"id": "C092", "text": "镜头翻转 对准爱的人", "category": "其他", "priority": 1, "variants": []},
  {"id": "C093", "text": "好微妙啊 你才微妙", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C094", "text": "莎莎的绿茶呢", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C095", "text": "这枚金牌是我们最美好的开始", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C096", "text": "我俩说打冠军再让他捏一下", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C097", "text": "这次她也心甘情愿让我捏了", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C098", "text": "拥抱了一下", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C099", "text": "你不会过了五年还这样吧", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C100", "text": "天才 非常好", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C101", "text": "注意称呼小豆包", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C102", "text": "九珍是肯德基的", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C103", "text": "你是世界上接我发球接最好的人", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C104", "text": "叫谁搭档呢", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C105", "text": "他老爱捏我脸", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C106", "text": "赢了带你绕一圈", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C107", "text": "杭州相见了一下", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C108", "text": "我们只有一对", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C109", "text": "回去请吃饭吧小豆包", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C110", "text": "新的开始 我们继续努力", "category": "莎头", "priority": 1, "variants": ["我们未来\n继续努力"]},
  {"id": "C111", "text": "他在我身边 我觉得还是挺踏实的吧", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C112", "text": "坚定昂！走", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C113", "text": "我们两个是从无到有一直这么配过来的吧", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C114", "text": "我搭档呢 也挺可爱的 然后吧场上打球也挺有样", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C115", "text": "残缺的玉叫做王 王加三笔叫做狂", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C116", "text": "什么年少轻狂 我只知道胜者为王", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C117", "text": "别定义我 你还不够格", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C118", "text": "实力一直有 你还不配我出手", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C119", "text": "25岁领军中国男乒", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C120", "text": "议论我有什么用 超越我才算本事", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C121", "text": "我从先农台来 要到领奖台去", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C122", "text": "不为盛名而来，不因低谷而去。", "category": "其他", "priority": 1, "variants": []},
  {"id": "C123", "text": "明亮的心将指引着她 把胜利带回", "category": "孙颖莎", "priority": 1, "variants": ["明亮的心指引着胜利", "明亮的心 将指引着她 把胜利带回"]},
  {"id": "C124", "text": "开了花的休斯敦", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C125", "text": "拼了命的南阳", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C126", "text": "许一个左手奇迹 续一个右手传奇", "category": "莎头", "priority": 1, "variants": ["许一个左手的奇迹，续一个右手的荣耀"]},
  {"id": "C127", "text": "用一颗心脏去震动另一颗心脏", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C128", "text": "南阳十二颠 留你在身边", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C129", "text": "祖国荣誉 高于一切", "category": "其他", "priority": 1, "variants": []},
  {"id": "C130", "text": "少年没有乌托邦 心向远方自明朗", "category": "王楚钦", "priority": 1, "variants": ["少年没有乌托邦 心向骄阳自明朗"]},
  {"id": "C131", "text": "一切都是最好的", "category": "其他", "priority": 1, "variants": []},
  {"id": "C132", "text": "赢了 就有答案", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C133", "text": "聚沙成塔 保持渴望", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C134", "text": "The Bright Heart\nThe Lion Heart", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C135", "text": "太阳永不坠落 希望永不破灭", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C136", "text": "与你共享荣光", "category": "莎头", "priority": 1, "variants": ["Share the glory with you"]},
  {"id": "C137", "text": "我们都在对方的前途里\n顶峰相见", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C138", "text": "那就祝我们都有光明的未来 顶峰相见", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C139", "text": "眼神注视的方向就是爱的方向", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C140", "text": "同频共振的人不会走散", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C141", "text": "坚持你所热爱的，追逐你所相信的。", "category": "其他", "priority": 1, "variants": []},
  {"id": "C142", "text": "她是烈焰，他是长风", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C143", "text": "无限渴望", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C144", "text": "希望你能学会快乐 未来见", "category": "王楚钦", "priority": 1, "variants": ["希望你学会快乐 未来见", "学会快乐 未来见"]},
  {"id": "C145", "text": "愿我的人生没有极限", "category": "王楚钦", "priority": 1, "variants": ["我的人生没有极限"]},
  {"id": "C146", "text": "纵有千古\n横有八荒\n前途似海\n来日方长", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C147", "text": "TEAM CHINA", "category": "其他", "priority": 1, "variants": []},
  {"id": "C148", "text": "你不要低估一颗 胜利者 的心，他的名字叫王楚钦", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C149", "text": "AS I FACING THE SUN", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C150", "text": "AS I CHASING THE HOPE", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C151", "text": "山河楚天阔，岁月共长钦", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C152", "text": "混双 天花板", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C153", "text": "八年确实和 八天不一样", "category": "莎头", "priority": 1, "variants": ["给你发了八年确实和发了八天的不一样"]},
  {"id": "C154", "text": "闪耀 洛杉矶", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C155", "text": "重庆的“重”是重逢的“重” 重庆的“庆”是庆祝的“庆”", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C156", "text": "钦尽全力 奔向太阳", "category": "王楚钦", "priority": 1, "variants": []},
  {"id": "C157", "text": "莎出重围 拥抱希望", "category": "孙颖莎", "priority": 1, "variants": []},
  {"id": "C158", "text": "球不落地 永不放弃", "category": "其他", "priority": 1, "variants": []},
  {"id": "C159", "text": "never give up", "category": "其他", "priority": 1, "variants": []},
  {"id": "C160", "text": "风从青奥起 吹往洛杉矶", "category": "莎头", "priority": 1, "variants": ["风从青奥起，吹到洛杉矶"]},
  {"id": "C161", "text": "两个人相互辉映，光芒胜过夜晚繁星", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C162", "text": "良人扶我青云志，相逢已是上上签", "category": "莎头", "priority": 1, "variants": ["良人扶我青云志 相逢已是上上签"]},
  {"id": "C163", "text": "爱是赛场上唯一合法且被允许的兴奋剂", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C164", "text": "在天才云集的天坛东路 她是他口中唯一的天才", "category": "莎头", "priority": 1, "variants": []},
  {"id": "C165", "text": "布宜诺斯艾利斯刮起的青春风暴席卷整个巴黎", "category": "莎头", "priority": 1, "variants": []},
];

function searchKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '');
}

const searchIndex = SLOGANS.map((slogan, index) => ({
  slogan,
  index,
  keys: [slogan.text, ...slogan.variants].map(searchKey),
}));

export function findSlogans(category: SloganFilter = '全部', query = ''): Slogan[] {
  const key = searchKey(query);
  const pinnedId = category === '其他' ? 'C039' : '';
  // Sort the current records at query time; source position is an explicit
  // tie-breaker for browsers whose Array.sort is not stable.
  return searchIndex.filter(item =>
    (category === '全部' || item.slogan.category === category) && item.keys.some(text => text.includes(key)),
  ).sort((a, b) => Number(b.slogan.id === pinnedId) - Number(a.slogan.id === pinnedId)
    || b.slogan.priority - a.slogan.priority || a.index - b.index).map(item => item.slogan);
}

export function getSloganPage(category: SloganFilter = '全部', query = '', requestedPage = 0) {
  const matches = findSlogans(category, query);
  const pageSize = 12;
  const pageCount = Math.ceil(matches.length / pageSize);
  const page = Math.max(0, Math.min(pageCount - 1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0));
  return { items: matches.slice(page * pageSize, (page + 1) * pageSize), page, pageCount, total: matches.length };
}

export function findSloganByText(text: string): Slogan | undefined {
  return SLOGANS.find(slogan => slogan.text === text || slogan.variants.includes(text));
}
