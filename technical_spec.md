# 架空历史小说角色 Agent Harness 系统 — 技术方案文档

> 版本: v1.0
> 日期: 2026-05-05
> 状态: 设计阶段

---

## 目录

1. [项目背景与动机](#一项目背景与动机)
2. [整体架构](#二整体架构)
3. [Stage 1：文档解析与结构化](#三stage-1文档解析与结构化)
4. [Stage 2：宏观分析师](#四stage-2宏观分析师)
5. [Stage 3：角色工厂](#五stage-3角色工厂)
6. [Stage 4：质量评估系统](#六stage-4质量评估系统)
7. [优化迭代记录](#七优化迭代记录)
8. [可行性分析](#八可行性分析)
9. [技术架构与选型](#九技术架构与选型)
10. [分阶段实现计划](#十分阶段实现计划)
11. [关键实现细节与难点攻坚](#十一关键实现细节与难点攻坚)
12. [项目目录结构](#十二项目目录结构)
13. [核心代码参考](#十三核心代码参考)
14. [附录](#十四附录)

---

## 一、项目背景与动机

### 1.1 问题定义

架空历史小说（如《冰与火之歌》《九州》系列）具有以下特征：

- **人物数量庞大**：主要角色 30-80 人，含配角可达 200 以上
- **关系网络复杂**：家族、师徒、敌对、同盟形成高度纠缠的图结构
- **时间跨度大**：角色经历成长、背叛、立场转变，前后一致性极难维护
- **文化一致性要求高**：架空世界观下的语言风格、价值观、禁忌需全局统一
- **叙事张力**：角色需要有内在矛盾和人物弧光，不能脸谱化

传统做法是作者用 Excel、笔记或 wiki 管理角色设定，容易出现前后矛盾、角色扁平化、关系描述不一致等问题。

### 1.2 项目目标

构建一套基于 LLM 的 Agent Harness 系统，从世界观文档自动解析并生成可交互的、一致的、有深度的角色智能体。

**输入**: 世界观文档（设定集、已写章节、势力关系图）

**输出**: 每个关键角色的完整 Agent Profile

```
├── Role Prompt（角色人设提示词）
├── Memory Bank（角色记忆库）
├── Behavior Tree（行为逻辑树）
└── Evaluation Report（质量评估报告）
```

### 1.3 为什么是 Agent Harness 而非简单 Prompt Engineering

单纯靠 Prompt Engineering 生成角色设定，本质上是一次性文本生成——没有状态管理、没有工具调用、没有迭代循环、没有错误恢复。而架空历史角色需要的是一个持续运行的智能体：

- 它需要感知当前对话情境和自身记忆状态
- 它需要决策在特定情境下该说什么、做什么
- 它需要行动时调用记忆检索、关系查询等外部工具
- 它需要观察自己言行的后果并更新状态
- 它需要护栏防止知识越界、人设漂移

这就是 Harness 的意义——不是让 LLM 一次性输出一个角色设定文档，而是用缰绳层把 LLM 驾驭成一个活的、可持续交互的角色智能体。

---

## 二、整体架构

整个系统分为四个阶段，每个阶段都是一个相对独立的 Harness 模块，模块之间通过结构化数据（知识图谱、角色 Profile）串联。

```
┌─────────────────────────────────────────────────────────────────┐
│                        Pipeline 总览                            │
│                                                                 │
│  ┌──────────┐   ┌──────────┐   ┌───────────┐   ┌────────────┐ │
│  │ Stage 1  │──►│ Stage 2  │──►│  Stage 3  │──►│  Stage 4   │ │
│  │ 文档解析  │   │ 宏观分析  │   │ 角色工厂   │   │ 质量评估    │ │
│  └──────────┘   └──────────┘   └───────────┘   └────────────┘ │
│       │              │              │                │         │
│       ▼              ▼              ▼                ▼         │
│  [结构化数据]   [势力图谱]     [角色Agent]      [评估报告]      │
│  [章节索引]     [矛盾矩阵]     [记忆库]         [回归测试]      │
│  [实体抽取]     [社会阶层]     [行为树]         [版本对比]      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、Stage 1：文档解析与结构化

### 3.1 多格式输入处理

系统支持 txt、Markdown、Word、PDF 等常见格式。对于 PDF，额外接入 OCR 兜底，确保扫描件也能被解析。

**技术选型**：

| 格式 | 库/工具 |
|------|---------|
| Markdown / txt | 原生 Python IO |
| Word (.docx) | `python-docx` |
| PDF（文本型） | `PyMuPDF` / `marker-pdf` |
| PDF（扫描件） | `PaddleOCR` / Azure Document Intelligence |

`marker-pdf` 对 PDF 转 Markdown 效果极佳，优于传统 OCR 方案，优先使用。

### 3.2 语义分块策略

不做简单的固定长度切分，而是按叙事逻辑分块。具体规则包括：

- **按章节/场景边界切分**：识别"第X章"、"Chapter X"等标题标记
- **按对话-叙述交替切分**：对话段落和叙述段落分别成块
- **时间跳跃检测**：遇到"三日后"、"数年之后"等时间标记时切分
- **视角切换检测**：POV 人物变化时切分
- **滑动窗口兜底**：如果单块过长，用滑动窗口重叠切分，窗口大小 1500 tokens，重叠 300 tokens，保证上下文连贯

**实现方式**：自研规则引擎 + `langchain` 的 `RecursiveCharacterTextSplitter` 兜底。

### 3.3 实体抽取与关系识别

使用 LLM 对每个文本块进行命名实体识别和关系抽取。抽取三类信息：

**角色实体**：角色名、别名、头衔、性别、所属势力、首次出场位置、外貌特征、性格关键词

**关系**：源角色、目标角色、关系类型（父子/师徒/敌对/同盟/恋人/主仆等）、关系强度（1-5）、关系描述、是否随时间变化

**事件**：参与角色、事件描述、重要性（1-5）、发生地点、时间标记

**技术选型**：LLM（GPT-4o-mini / DeepSeek-V3）+ `instructor` 库强制结构化输出。

抽取完成后进行**实体消歧**——同一个人在不同章节可能有不同称呼（如"李世民"、"秦王"、"二郎"），需要合并为同一实体。消歧策略是用 LLM 判断两个名称是否指向同一人，结合图谱中的关系邻域进行交叉验证。

### 3.4 知识图谱存储

使用 **Neo4j Community Edition** 存储角色关系图谱。选择图数据库而非向量数据库的原因：角色关系是精确的结构化查询（如"找出所有与 A 角色有敌对关系且属于 B 势力的角色"），图数据库的 Cypher 查询毫秒级响应，而向量数据库做近似搜索既不精确也更慢。

知识图谱中包含角色节点（带属性）、关系边（带类型和权重）、事件节点（带参与角色链接）。

**核心 Schema**：

```cypher
// 角色节点
CREATE (c:Character {
  id: "char_001",
  name: "李世民",
  aliases: ["秦王", "二郎"],
  gender: "男",
  faction: "唐",
  firstAppearance: "chapter_1",
  appearance: "方面大耳，凤目龙瞳",
  personalityKeywords: ["果决", "隐忍", "雄才大略"]
})

// 关系边
CREATE (c1)-[:RELATION {
  type: "父子",
  strength: 5,
  description: "李渊与李世民",
  isTimeVariant: false
}]->(c2)

// 事件节点
CREATE (e:Event {
  id: "evt_001",
  description: "玄武门之变",
  importance: 5,
  location: "长安",
  timeMarker: "武德九年六月初四"
})
CREATE (c1)-[:PARTICIPATE {role: "主导者"}]->(e)
```

---

## 四、Stage 2：宏观分析师（Macro Analyst）

### 4.1 职责定义

宏观分析师是一个独立的 Agent，它的任务不是生成具体角色，而是从全局视角分析世界观的结构，为后续角色生成提供顶层约束。

它输出五个核心产物：

**势力结构图**：基于知识图谱中的关系边进行社区检测（Louvain 算法），自动识别势力聚类，然后用 LLM 总结每个势力的名称、核心价值观、内部权力结构、与其他势力的主要矛盾、该势力的典型角色类型。

**社会矛盾矩阵**：构建所有关键角色两两之间的矛盾分析。对每一对角色，分析是否存在显性冲突（直接敌对）、隐性冲突（利益/价值观/立场对立）、冲突根源（权力/资源/信仰/情感）、冲突强度、可能的演变方向。

**角色重要性排序**：综合图论指标（度中心性、介数中心性、PageRank）和叙事指标（出场频次、关键事件参与度），对所有角色进行重要性评分。只对 Top-K 角色进行深度 Agent 生成，其余用模板快速生成。这是 Harness 中资源调度思想的体现——不是所有角色都需要同等的计算资源。

**世界观一致性规则**：从原文中提取语言风格（如古代用语vs现代白话）、社会禁忌、常识性规则（如该世界没有火药、魔法需要代价等）。这些规则会被注入每个角色的 Prompt 作为硬约束。

**叙事弧光模板**：识别每个关键角色的成长轨迹类型（英雄之旅/悲剧/成长/堕落/救赎），为角色的行为逻辑树提供叙事层面的约束。

### 4.2 宏观分析师本身也是 Harness

宏观分析师不是一个简单的 LLM 调用，它本身就是一个小型 Agent Harness：

- **感知层**：接收知识图谱和全文语料作为输入
- **工具层**：调用图论算法库（社区检测、中心性计算）、调用 LLM 进行摘要和分析
- **决策层**：多步推理——先做图谱分析，再做 LLM 解读，再做综合排序
- **输出层**：结构化产物（JSON 格式的宏观分析报告），供下游消费

**技术选型**：

| 组件 | 选型 |
|------|------|
| 社区检测 | Neo4j GDS `gds.louvain.stream()` |
| 中心性计算 | GDS `gds.degree.stream()` / `gds.betweenness.stream()` / `gds.pageRank.stream()` |
| LLM 摘要分析 | GPT-4o / Claude 3.5 Sonnet |
| 社会矛盾矩阵 | 自研算法：遍历关键角色对 + LLM 分析 |

---

## 五、Stage 3：角色工厂（Character Factory）

### 5.1 Harness 分层设计

角色工厂是整个系统的核心 Harness。它采用分层智能体设计：

```
┌──────────────────────────────────────────────────────────┐
│                    角色工厂 Harness                       │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │           编排层 (Orchestrator)                      │  │
│  │  负责任务调度、并发控制、速率限制、异常处理          │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │                                │
│  ┌──────────┬───────────┼───────────┬──────────┐        │
│  │          │           │           │          │        │
│  ▼          ▼           ▼           ▼          ▼        │
│  Agent 1   Agent 2    Agent 3    Agent 4    Agent N     │
│  角色A     角色B      角色C      角色D      角色N       │
│  ┌──────────────────────────────────────────────┐       │
│  │  每个角色 Agent 内部 Harness 结构:            │       │
│  │  ① 感知层: 收集角色上下文（图谱+原文+宏观分析）│       │
│  │  ② 决策层: 生成 Role Prompt / 记忆 / 行为树   │       │
│  │  ③ 执行层: 调用 LLM 生成、调用存储写入        │       │
│  │  ④ 护栏层: 一致性检查、知识边界校验           │       │
│  └──────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────┘
```

### 5.2 并发调度与速率控制

角色生成是 I/O 密集型任务（主要等待 LLM API 响应），因此采用异步并发。设置信号量控制最大并发度为 10，同时用令牌桶算法控制总 Token 消耗速率，避免触发 API 限流。

对于生成失败的角色，不阻塞整体流程，而是降级为简化模板生成，后续人工审核补充。

**技术选型**：

| 组件 | 选型 |
|------|------|
| 并发控制 | `asyncio.Semaphore(10)` |
| 令牌桶限流 | 自研或 `aiolimiter` |
| 编排层 | 自研 `Orchestrator`（基于 `asyncio`） |

### 5.3 Role Prompt 生成

每个角色的系统提示词包含以下模块：

- **角色身份**：姓名、性别、年龄、头衔、所属势力、社会阶层
- **外貌特征**：从原文提取的物理描述
- **性格特征**：从原文对话和行为中归纳的性格关键词，附带原文支撑
- **说话风格**：包含 2-3 个原文对话示例作为 Few-shot 参考
- **核心信念与价值观**：角色坚信什么、反对什么
- **人际关系认知**：角色对其他关键角色的看法和态度（从角色第一人称视角描述）
- **知道的事情**：严格基于剧情时间线，角色在当前时间点已经经历和被告知的事实
- **不知道的事情**：角色不可能知道的信息（未来事件、其他角色的秘密计划、现代概念等）
- **行为准则**：具体可执行的行为指引，而非空泛的道德描述
- **禁忌与底线**：角色绝对不会做的事情

这里体现了 Harness 的感知层设计——Prompt 不是凭空编写的，而是从知识图谱、原文语料、宏观分析结果中结构化地组装而来。

**技术选型**：LLM + **Jinja2** 模板引擎。模板化组装 Prompt 模块，便于版本管理和 A/B 测试。

### 5.4 记忆库构建

记忆系统是角色 Agent Harness 的核心组件之一，采用三层记忆架构：

**短期记忆（工作记忆）**：当前对话/场景内的最近交互。容量有限（约 20 条），超出时通过摘要压缩机制将旧记忆转入长期记忆。这对应 Harness 中的上下文窗口管理——不是把所有历史都塞进 Prompt，而是智能地选择哪些信息留在当前上下文中。

**长期记忆（情景记忆）**：角色的人生经历，从原文中按时间线提取。每段记忆包含内容（以角色第一人称视角重写）、时间戳、情感效价、重要性评分、相关角色列表。存储在向量数据库中，支持按语义相似度检索。

**语义记忆**：角色的信念、偏好、经验总结，以键值对形式存储。比如"相信：血浓于水"、"厌恶：背叛"、"恐惧：被遗弃"等。这些是角色行为的深层驱动力。

记忆检索采用加权评分策略：综合相关性（向量相似度）、时效性（时间衰减）、重要性（事件权重）三个维度，取 Top-K 返回给角色的上下文。

**技术选型**：

| 记忆类型 | 存储方案 |
|----------|----------|
| 短期记忆 | 内存 `deque`（容量 20） |
| 长期记忆 | **ChromaDB**（轻量）或 **Milvus**（大规模） |
| 语义记忆 | PostgreSQL JSONB 或 MongoDB |

**记忆检索加权公式**：

```
score = α * similarity + β * recency + γ * importance

其中：
- similarity: 向量余弦相似度（0-1）
- recency: 时间衰减函数 exp(-λ * (now - timestamp))
- importance: 事件重要性评分（1-5 归一化到 0-1）
- α + β + γ = 1，默认 α=0.5, β=0.3, γ=0.2
```

### 5.5 行为逻辑树

行为逻辑树定义角色在不同情境下的决策优先级。它是一棵多层树结构，包含四种节点：

- **选择节点**：从多个子节点中选择第一个满足条件的执行
- **序列节点**：按顺序执行所有子节点
- **条件节点**：判断某个条件是否满足
- **动作节点**：执行具体行为

比如一个封建领主角色的行为树可能是：先判断是否有紧急军情（有则进入军事应对子树），再判断是否有内政事务（有则进入裁决子树），最后默认巡视领地。军事应对子树中，如果兵力占优则主动出击，否则坚守待援。

行为树解决了纯 Prompt 约束的优先级模糊问题。Prompt 写"你忠诚但也有道德底线"，当忠诚和道德冲突时 LLM 不知道该优先哪个。行为树通过选择节点的从左到右尝试顺序，天然定义了优先级。

同时行为树也是可调试的——可以追踪角色决策走了树的哪条路径，便于定位角色行为异常的原因。

**行为树与 LLM 的融合策略**：

- 行为树定义**决策优先级**（选择节点从左到右尝试），但不定义具体文案
- 叶子节点（动作节点）调用 LLM 生成具体回复，Prompt 中注入行为树路径作为上下文
- 强制 LLM 在生成回复前输出 `Thought` 推理链，说明当前走了行为树的哪条路径

**行为树 DSL 示例**：

```yaml
# 封建领主行为树
selector:
  name: "日常决策"
  children:
    - condition: "有紧急军情"
      selector:
        children:
          - condition: "兵力占优"
            action: "主动出击"
          - action: "坚守待援"
    - condition: "有内政事务"
      action: "进入裁决"
    - action: "巡视领地"
```

### 5.6 跨角色一致性保障

这是角色工厂最关键的 Harness 护栏机制，分三个阶段：

**生成前**：所有角色共享同一份宏观分析结果。每个角色的 Prompt 中都包含它与其他关键角色的关系定义，且这些定义来自同一个数据源（Neo4j 知识图谱），从源头保证数据一致。

**生成中**：对关键关系（如父子、宿敌），采用先生成主导方、再生成从属方的策略。先生成"父亲"角色对"儿子"的认知描述，再将这个认知注入"儿子"角色的 Prompt 中，确保双向关系对称。

**生成后**：跨角色一致性检查。用一个专门的检查 Agent 遍历所有生成的角色 Profile，检测三类问题：

- **关系对称性**（A 对 B 的态度 vs B 对 A 的态度是否矛盾）
- **事实一致性**（同一事件不同角色的描述是否矛盾）
- **时间线一致性**（角色知道的事件时间线是否一致）

检测到不一致时自动触发重新生成或标记人工审核。

---

## 六、Stage 4：质量评估系统

### 6.1 "图灵测试"风格评估框架

评估框架的核心思路：让生成的角色回答一系列预设的压力测试问题，再由另一个 LLM（裁判模型）对回答进行多维度打分。

```
┌─────────────────────────────────────────────────────┐
│                  评估 Harness                        │
│                                                     │
│  ┌───────────┐    ┌──────────────┐    ┌──────────┐ │
│  │ 压力测试题  │───►│ 角色 Agent   │───►│ 裁判 LLM │ │
│  │ (题库)     │    │ (被测对象)    │    │ (评分)    │ │
│  └───────────┘    └──────────────┘    └─────┬────┘ │
│                                              │      │
│                                              ▼      │
│                                     ┌─────────────┐ │
│                                     │  评估报告    │ │
│                                     │  回归对比    │ │
│                                     └─────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 6.2 压力测试题库

测试题库覆盖五大类别，每个类别下有若干标准测试场景：

**道德困境**：测试角色价值观的一致性。比如"你的挚友叛国了，但你知道他是为了保护家人，国王命令你抓捕他"。不同角色应有不同但各自合理的反应，体现其核心价值观。

**突发状况**：测试角色应变能力和行为逻辑。比如"你最信任的部下突然向你拔刀"。反应应符合角色的性格和能力设定——一个身经百战的将军和一个文弱书生的反应应该截然不同。

**知识边界**：测试角色是否"越界"知道不该知道的事。比如对一个架空中世纪角色问"你觉得互联网是什么"，角色应表现出困惑或不理解，绝不应解释互联网。又如角色在故事第三章，不应该知道第十章的事件。

**性格压力**：把角色逼到性格极限。比如对一个骄傲的角色说"所有人都嘲笑你的计划失败了"，应体现骄傲但不崩溃的反应——可能愤怒、辩解或暗下决心。

**关系探测**：测试角色对其他角色的认知是否准确。比如问"你怎么看待你的宿敌"，态度应与原文中的关系设定一致。

除了标准测试题，系统还会根据每个角色的特征动态生成个性化测试题——一个骑士角色和一个谋士角色的测试重点完全不同。

### 6.3 裁判 LLM 的设计

裁判模型的角色是严格的角色扮演质量评估专家。它对每个角色的回答从五个维度独立打分：

- **人设贴合度**：回答是否符合角色的性格特征，语言风格是否一致，是否有"出戏"表现
- **逻辑一致性**：回答是否与角色已知信息一致，是否存在前后矛盾
- **知识边界遵守**：角色是否说出了不应该知道的信息
- **情感真实性**：角色的情感反应是否自然，是否过于平淡或夸张
- **深度与复杂性**：回答是否展现了角色的多面性，是否过于脸谱化

裁判与选手分离——生成用 GPT-4o，裁判也用 GPT-4o 但不同实例，temperature 设为 0.1 减少随机性。我们也做过交叉验证，用 Claude 3.5 做裁判，结果与 GPT-4o 裁判的一致率达到 87%。

为了进一步校准裁判偏差，我们标注了 50 组人工评分标准答案，定期用这些样本校准裁判模型的打分分布。知识边界测试是二值判断（越界/未越界），不依赖裁判主观判断，准确率接近 100%。

**评估维度评分标准（10 分制）**：

```python
class EvaluationScore(BaseModel):
    character_consistency: float  # 人设贴合度
    logical_consistency: float    # 逻辑一致性
    knowledge_boundary: float     # 知识边界遵守（二值可转 0/10）
    emotional_authenticity: float # 情感真实性
    depth_complexity: float       # 深度与复杂性
```

### 6.4 回归测试机制

引入软件工程中的回归测试概念：当调整 Prompt 模板、更换基座模型、修改记忆策略时，自动运行整套评估集，确保新版本的角色质量不低于旧版本。

具体做法：

- 每次评估通过后，将分数结果作为基线以 JSON 文件存储，文件名带时间戳和 Git commit hash
- 基线文件纳入 Git 版本控制，可以 diff 任意两个版本的分数变化
- 在 Prompt 工程的 CI 流水线中集成回归测试，如果新版本任何角色的任何维度分数下降超过 0.5 分（满分 10 分），Pipeline 标红阻断合并
- 用可视化面板展示各角色各维度分数的时间趋势，便于发现缓慢退化

**技术选型**：

| 组件 | 选型 |
|------|------|
| 压力测试题库 | PostgreSQL / MongoDB + 动态生成模板 |
| 裁判 LLM | GPT-4o（temperature=0.1） |
| 交叉验证 | Claude 3.5 Sonnet 作为备用裁判 |
| 人工标注校准 | 50 组标准答案存入数据库 |
| 回归测试 CI | **GitHub Actions** 或 **GitLab CI** |
| 可视化面板 | **Streamlit** 或 **Grafana** |

---

## 七、优化迭代记录

### 7.1 问题诊断与解决

**角色失忆**：长对话中早期记忆被上下文截断。解决方案是滑动窗口记忆机制——设置窗口大小为 10 轮对话，重叠 3 轮。窗口满时用 LLM 压缩旧对话为结构化摘要存入长期记忆。同时通过向量相似度检索，在需要时将相关历史记忆拉回当前上下文。经过消融实验，窗口大小 10、重叠 3 在失忆率（12%）和 Token 消耗之间达到最佳平衡，配合长期记忆检索可将失忆率降到 5% 以下。

**逻辑跳跃**：角色突然做出与设定不符的决策。解决方案是引入行为树约束，强制角色在行动前输出推理链（Thought），让决策过程可追溯。

---

## 八、可行性分析

### 8.1 技术可行性

| 维度 | 评估 | 说明 |
|------|------|------|
| **LLM 能力支撑** | ✅ 可行 | GPT-4o / Claude 3.5 / DeepSeek-V3 等当前主流模型已具备长文本理解、结构化输出、角色扮演和复杂推理能力。文档解析、实体抽取、Prompt 生成、裁判评分均可由 LLM 完成。 |
| **知识图谱存储** | ✅ 成熟 | Neo4j 是业界标准的图数据库，Cypher 查询性能优异，社区检测算法（Louvain）已有成熟库（如 `neo4j-graph-data-science`）。 |
| **向量检索** | ✅ 成熟 | 长期记忆的语义检索可用 Milvus/Pinecone/Weaviate 或轻量级的 `chromadb`，技术栈非常成熟。 |
| **并发与调度** | ✅ 成熟 | Python `asyncio` + `Semaphore` + 令牌桶算法（`asyncio-throttle` 或自研）可完美支持 I/O 密集型并发。 |
| **行为树执行** | ✅ 可行 | 行为树是游戏 AI 的经典方案，Python 有 `py_trees` 等库，或自研轻量 DSL 解释器。 |
| **回归测试 CI** | ✅ 成熟 | 可集成到 GitHub Actions / GitLab CI，基线对比用 JSON diff 即可实现。 |

**结论**：所有核心技术环节都有现成方案或成熟库支撑，不存在无法逾越的技术障碍。

### 8.2 成本可行性

| 成本项 | 预估 | 优化空间 |
|--------|------|----------|
| **LLM API 费用** | 中等偏高 | Stage 1-4 均依赖 LLM 调用。以 50 角色、每角色 10 轮评估为例，单次 Pipeline 约消耗 5-20M tokens（$15-$60，按 GPT-4o 定价）。开发调试阶段可降级到 GPT-4o-mini 或本地模型（Ollama/Qwen）。 |
| **存储与计算** | 低 | Neo4j 社区版免费，向量库可用开源方案。整体对 GPU 无强需求（除非部署本地大模型）。 |
| **人力成本** | 中高 | 系统涉及 NLP、图谱、Agent 框架、评测体系，需要全栈工程师 + 算法工程师配合。 |

**结论**：作为创作辅助工具，单次运行成本可控；若面向 C 端提供 SaaS，需设计按量计费或订阅模式。

### 8.3 风险与缓解

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| **LLM 输出不稳定** | 高 | 全链路使用 JSON Schema / Pydantic 强制结构化输出；关键节点设置重试 + 降级策略；裁判模型交叉验证。 |
| **角色一致性漂移** | 高 | 跨角色一致性检查 Agent + 行为树硬约束 + 回归测试阻断机制。 |
| **长文本记忆截断** | 中 | 三层记忆架构 + 滑动窗口 + 摘要压缩 + 向量检索召回，可将失忆率控制在 5% 以下（文档中已有验证数据）。 |
| **知识边界越界** | 中 | "不知道的事情"白名单机制 + 知识边界专项压力测试，准确率可接近 100%。 |
| **行为树过于僵化** | 低 | 行为树作为"优先级框架"而非"死规则"，底层仍由 LLM 生成具体文案，保留创造性。 |

---

## 九、技术架构与选型

### 9.1 整体技术栈

```
┌─────────────────────────────────────────────────────────────┐
│                      前端层（可选）                           │
│         Streamlit / Gradio（快速原型） 或 React（产品化）       │
├─────────────────────────────────────────────────────────────┤
│                      API 网关层                               │
│              FastAPI（异步、自动文档、Pydantic 校验）            │
├─────────────────────────────────────────────────────────────┤
│                     Harness 核心引擎                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────┐   │
│  │ Stage 1 │ │ Stage 2 │ │ Stage 3 │ │    Stage 4      │   │
│  │文档解析 │ │宏观分析 │ │角色工厂 │ │   质量评估       │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                     数据与存储层                              │
│  Neo4j（图数据库）  │  ChromaDB/Milvus（向量数据库）           │
│  PostgreSQL/Mongo（元数据、评估基线、版本控制）               │
├─────────────────────────────────────────────────────────────┤
│                     LLM 接入层                                │
│  OpenAI API │ Anthropic API │ 本地模型（Ollama/vLLM）        │
│  统一封装适配器（支持切换、降级、Token 计费）                  │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 各模块技术选型详解

#### Stage 1：文档解析与结构化

| 组件 | 选型 | 理由 |
|------|------|------|
| **多格式解析** | `python-docx` + `PyMuPDF` + `marker-pdf` | `marker-pdf` 对 PDF 转 Markdown 效果极佳，优于传统 OCR 方案 |
| **OCR 兜底** | `PaddleOCR` 或接入 Azure Document Intelligence | 扫描件识别准确率高，支持中文 |
| **语义分块** | 自研规则引擎 + `langchain` 的 `RecursiveCharacterTextSplitter` 兜底 | 按章节/对话/时间/POV 切分是业务逻辑，需自研；超长块用 LangChain 滑动窗口 |
| **实体抽取** | LLM（GPT-4o / DeepSeek-V3）+ `instructor` 库 | `instructor` 强制 LLM 输出符合 Pydantic Schema，解决 JSON 不稳定问题 |
| **实体消歧** | LLM 判断 + 图谱邻域验证 | 先 LLM 初判，再用 Neo4j 查询关系邻域交叉验证 |
| **知识图谱** | **Neo4j Community Edition** + `neo4j-python-driver` | 成熟稳定，Cypher 查询直观，支持 GDS 库做社区检测 |

#### Stage 2：宏观分析师

| 组件 | 选型 | 理由 |
|------|------|------|
| **社区检测** | Neo4j GDS `gds.louvain.stream()` | 原生支持，性能优秀 |
| **中心性计算** | GDS `gds.degree.stream()` / `gds.betweenness.stream()` / `gds.pageRank.stream()` | 原生支持 |
| **LLM 摘要分析** | GPT-4o / Claude 3.5 Sonnet | 长文本理解能力强，适合总结势力结构和社会矛盾 |
| **社会矛盾矩阵** | 自研算法：遍历关键角色对 + LLM 分析 | 两两组合数 O(n²)，需控制 Top-K 角色数量 |

#### Stage 3：角色工厂（核心）

| 组件 | 选型 | 理由 |
|------|------|------|
| **编排层** | 自研 `Orchestrator`（基于 `asyncio` + `asyncio.Semaphore(10)`） | 业务逻辑复杂，通用框架（如 LangGraph）反而增加理解成本 |
| **令牌桶限流** | 自研或 `aiolimiter` | 控制 RPM 和 TPM，避免 API 限流 |
| **Role Prompt 生成** | LLM + Jinja2 模板引擎 | 模板化组装 Prompt 模块，便于版本管理和 A/B 测试 |
| **记忆库 - 短期记忆** | 内存 `deque`（容量 20） | 当前对话窗口管理 |
| **记忆库 - 长期记忆** | **ChromaDB**（轻量）或 **Milvus**（大规模） | 语义检索 + 元数据过滤（时间戳、情感效价） |
| **记忆库 - 语义记忆** | PostgreSQL JSONB 或 MongoDB | 键值对 + 向量检索混合查询 |
| **行为树** | 自研轻量 DSL + 执行引擎，或 `py_trees` | `py_trees` 适合游戏，但需适配 LLM 调用；建议自研简化版 |
| **护栏层** | 自研 `GuardrailAgent` + `trulens`（可选） | 一致性检查、知识边界校验 |

#### Stage 4：质量评估系统

| 组件 | 选型 | 理由 |
|------|------|------|
| **压力测试题库** | PostgreSQL / MongoDB + 动态生成模板 | 标准题 + 个性化动态生成 |
| **裁判 LLM** | GPT-4o（temperature=0.1） | 低温度减少随机性，保证评分稳定 |
| **交叉验证** | Claude 3.5 Sonnet 作为备用裁判 | 一致性率 87%，可作为校准参考 |
| **人工标注校准** | 50 组标准答案存入数据库 | 定期用这些样本校准裁判模型打分分布 |
| **回归测试 CI** | **GitHub Actions** 或 **GitLab CI** | 自动化 Pipeline，分数下降超阈值阻断合并 |
| **可视化面板** | **Streamlit** 或 **Grafana** | 展示角色各维度分数时间趋势 |

---

## 十、分阶段实现计划

### Phase 0：基础设施与验证（Week 1-2）

**目标**：搭建最小可运行单元，验证核心假设。

| 任务 | 产出 |
|------|------|
| 搭建 FastAPI 项目骨架 + 配置管理 | 可运行的空项目 |
| 接入 LLM 统一适配器（支持 OpenAI / Claude / 本地模型切换） | LLM 调用接口 |
| 部署 Neo4j Community + 设计核心 Schema | 本地图数据库 |
| 部署 ChromaDB（本地） | 向量数据库 |
| 用 1 个短篇小说（如《三国演义》片段）做端到端手工验证 | 验证报告 |

**里程碑**：能手工跑通"文档 → 实体抽取 → 存入 Neo4j → 查询关系"全流程。

### Phase 1：Stage 1 文档解析（Week 3-4）

**目标**：实现多格式文档的自动解析与知识图谱构建。

| 任务 | 技术要点 |
|------|----------|
| 实现多格式解析 Pipeline | `marker-pdf` + `python-docx` + `PaddleOCR` 兜底 |
| 实现语义分块引擎 | 章节/对话/时间/POV 规则 + 滑动窗口兜底 |
| 实现 LLM 实体抽取（带 Schema 约束） | `instructor` + Pydantic 模型 |
| 实现实体消歧 | LLM 初判 + 图谱邻域验证 |
| 实现 Neo4j 写入与基础查询 | `neo4j-python-driver` |

**里程碑**：输入一本 10 万字小说，自动构建包含 100+ 角色、500+ 关系的知识图谱。

### Phase 2：Stage 2 宏观分析（Week 5-6）

**目标**：实现宏观分析师 Agent，输出势力结构、矛盾矩阵、角色排序。

| 任务 | 技术要点 |
|------|----------|
| 集成 Neo4j GDS 社区检测 | Louvain 算法 + LLM 总结势力 |
| 实现中心性计算与角色排序 | 度中心性 + 介数中心性 + PageRank |
| 实现社会矛盾矩阵生成 | 遍历 Top-K 角色对 + LLM 分析 |
| 提取世界观一致性规则 | LLM 摘要 + 规则模板 |
| 识别叙事弧光模板 | LLM 分析角色成长轨迹 |

**里程碑**：输出一份结构化的宏观分析报告（JSON），包含势力图、矛盾矩阵、Top-20 角色排序。

### Phase 3：Stage 3 角色工厂 MVP（Week 7-10）

**目标**：实现核心 Harness，生成首批角色 Agent。

| 任务 | 技术要点 |
|------|----------|
| 实现并发编排器（Orchestrator） | `asyncio.Semaphore(10)` + 令牌桶 |
| 实现 Role Prompt 模板引擎 | Jinja2 + 模块化组装 |
| 实现三层记忆架构 | 短期（deque）+ 长期（ChromaDB）+ 语义（PostgreSQL JSONB） |
| 实现记忆检索加权评分 | 相关性 + 时效性 + 重要性 |
| 实现行为树 DSL 与执行引擎 | YAML/JSON 定义 + 解释器 |
| 实现跨角色一致性检查 | 关系对称性 + 事实一致性 + 时间线一致性 |
| 生成首批 5-10 个核心角色 | 端到端验证 |

**里程碑**：5 个核心角色可交互对话，通过基础一致性检查。

### Phase 4：Stage 4 质量评估（Week 11-12）

**目标**：建立可量化的质量评估与回归测试体系。

| 任务 | 技术要点 |
|------|----------|
| 构建标准压力测试题库 | 5 大类场景 × 10 题 = 50 题 |
| 实现动态测试题生成 | 基于角色特征个性化生成 |
| 实现裁判 LLM 评分系统 | 5 维度 × 10 分制 + 结构化输出 |
| 实现人工标注校准流程 | 50 组标准答案 + 分布校准 |
| 实现回归测试基线管理 | JSON 基线文件 + Git 版本控制 |
| 集成 CI Pipeline | GitHub Actions + 分数下降阻断 |

**里程碑**：完整评估一次 5 角色，生成评估报告，建立首个基线。

### Phase 5：系统优化与产品化（Week 13-16）

**目标**：解决已知问题，提升稳定性，准备对外交付。

| 任务 | 技术要点 |
|------|----------|
| 解决角色失忆问题 | 滑动窗口（10轮/重叠3轮）+ 摘要压缩 + 向量召回 |
| 解决逻辑跳跃问题 | 行为树约束 + Thought 推理链输出 |
| 优化 Token 消耗与成本 | Prompt 压缩 + 缓存机制 + 模型降级策略 |
| 开发可视化前端 | Streamlit 快速原型 → React 产品化 |
| 支持导出角色 Profile | JSON / Markdown / 导入常见 AI 聊天工具 |
| 编写用户文档与 API 文档 | FastAPI 自动文档 + 使用手册 |

**里程碑**：系统可稳定运行，支持 50+ 角色生成与评估，具备前端交互界面。

---

## 十一、关键实现细节与难点攻坚

### 11.1 实体消歧策略（精准度关键）

**问题**："李世民"、"秦王"、"二郎"、"天可汗"指向同一人，LLM 可能误判。

**方案**：

1. **候选生成**：基于字符串相似度（Jaro-Winkler）+ 共现窗口生成候选对。
2. **LLM 初判**：Prompt 中包含两个名称的上下文片段，让 LLM 判断是否为同一人。
3. **图谱验证**：若 LLM 认为可能是同一人，查询 Neo4j 中两个节点的关系邻域——如果共享大量邻居（如都与"李渊"有父子关系），则确认合并。
4. **人工审核队列**：置信度低于 0.8 的候选对进入人工审核队列。

### 11.2 记忆检索加权公式

```
score = α * similarity + β * recency + γ * importance

其中：
- similarity: 向量余弦相似度（0-1）
- recency: 时间衰减函数 exp(-λ * (now - timestamp))
- importance: 事件重要性评分（1-5 归一化到 0-1）
- α + β + γ = 1，默认 α=0.5, β=0.3, γ=0.2
```

### 11.3 行为树与 LLM 的融合

**问题**：纯行为树太僵化，纯 LLM 太随机。

**方案**：

- 行为树定义**决策优先级**（选择节点从左到右尝试），但不定义具体文案。
- 叶子节点（动作节点）调用 LLM 生成具体回复，Prompt 中注入行为树路径作为上下文。
- 强制 LLM 在生成回复前输出 `Thought` 推理链，说明当前走了行为树的哪条路径。

```python
# 示例：动作节点调用 LLM
async def action_node_llm(context, bt_path, memories):
    prompt = f"""
    你是{character.name}，当前情境：{context}
    你的决策路径：{' -> '.join(bt_path)}
    相关记忆：{memories}

    请先输出 Thought（说明你的决策理由），再输出 Action（具体回复）。
    """
    return await llm.generate(prompt)
```

### 11.4 跨角色一致性检查算法

```python
def check_relationship_symmetry(char_a, char_b):
    """检查关系对称性"""
    a_to_b = char_a.profile.relationships[char_b.id].attitude
    b_to_a = char_b.profile.relationships[char_a.id].attitude

    # 用 LLM 判断两个态度描述是否矛盾
    contradiction_score = llm_judge(f"态度1：{a_to_b}\n态度2：{b_to_a}\n是否矛盾？")
    return contradiction_score

def check_fact_consistency(event, participants):
    """检查同一事件不同角色描述是否矛盾"""
    descriptions = [p.memory.get(event.id) for p in participants]
    # 用 LLM 判断描述一致性
    return llm_judge_consistency(descriptions)
```

### 11.5 成本优化策略

| 策略 | 效果 |
|------|------|
| **模型分层** | Stage 1 抽取用 GPT-4o-mini（便宜 15 倍），Stage 3 生成用 GPT-4o，Stage 4 裁判用 GPT-4o |
| **Prompt 缓存** | 重复使用的世界观规则、角色基础信息缓存到系统 Prompt，减少重复 Token |
| **结果缓存** | 宏观分析结果、知识图谱查询结果缓存到 Redis，避免重复计算 |
| **本地模型兜底** | 开发调试阶段用 Qwen2.5-72B（Ollama）或 vLLM 部署，零 API 成本 |

---

## 十二、项目目录结构

```
novel-agent-harness/
├── README.md
├── pyproject.toml                    # Poetry 依赖管理
├── .env.example                      # 环境变量模板
├── .github/
│   └── workflows/
│       └── regression_test.yml       # 回归测试 CI
├── config/
│   ├── __init__.py
│   ├── settings.py                   # Pydantic Settings 配置管理
│   └── prompts/                      # Jinja2 Prompt 模板
│       ├── role_prompt.j2
│       ├── entity_extraction.j2
│       ├── macro_analysis.j2
│       └── evaluation.j2
├── src/
│   ├── __init__.py
│   ├── api/                          # FastAPI 网关层
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── routers/
│   │   │   ├── pipeline.py           # Pipeline 执行接口
│   │   │   ├── characters.py         # 角色管理接口
│   │   │   └── evaluation.py         # 评估接口
│   │   └── schemas/
│   │       └── ...
│   ├── core/                         # Harness 核心引擎
│   │   ├── __init__.py
│   │   ├── llm/                      # LLM 统一适配器
│   │   │   ├── __init__.py
│   │   │   ├── base.py               # 抽象基类
│   │   │   ├── openai_client.py
│   │   │   ├── anthropic_client.py
│   │   │   └── local_client.py       # Ollama / vLLM
│   │   ├── stage1/                   # 文档解析与结构化
│   │   │   ├── __init__.py
│   │   │   ├── document_parser.py    # 多格式解析
│   │   │   ├── chunker.py            # 语义分块
│   │   │   ├── entity_extractor.py   # 实体抽取（instructor）
│   │   │   └── entity_resolver.py    # 实体消歧
│   │   ├── stage2/                   # 宏观分析师
│   │   │   ├── __init__.py
│   │   │   ├── macro_analyst.py      # 宏观分析 Harness
│   │   │   ├── faction_detector.py   # 势力检测（Louvain）
│   │   │   ├── conflict_matrix.py    # 矛盾矩阵
│   │   │   └── importance_ranker.py  # 角色重要性排序
│   │   ├── stage3/                   # 角色工厂
│   │   │   ├── __init__.py
│   │   │   ├── orchestrator.py       # 并发编排器
│   │   │   ├── character_agent.py    # 角色 Agent Harness
│   │   │   ├── role_prompt_builder.py # Role Prompt 生成
│   │   │   ├── memory/               # 记忆系统
│   │   │   │   ├── __init__.py
│   │   │   │   ├── short_term.py     # 短期记忆
│   │   │   │   ├── long_term.py      # 长期记忆（向量检索）
│   │   │   │   ├── semantic.py       # 语义记忆
│   │   │   │   └── retrieval.py      # 加权检索
│   │   │   ├── behavior_tree/        # 行为树
│   │   │   │   ├── __init__.py
│   │   │   │   ├── dsl.py            # DSL 定义
│   │   │   │   ├── parser.py         # DSL 解析器
│   │   │   │   └── executor.py       # 执行引擎
│   │   │   └── guardrail.py          # 护栏层
│   │   └── stage4/                   # 质量评估
│   │       ├── __init__.py
│   │       ├── evaluator.py          # 评估 Harness
│   │       ├── test_bank.py          # 测试题库
│   │       ├── judge_llm.py          # 裁判 LLM
│   │       ├── baseline_manager.py   # 基线管理
│   │       └── regression.py         # 回归测试
│   ├── storage/                      # 数据存储层
│   │   ├── __init__.py
│   │   ├── neo4j_client.py           # Neo4j 图数据库
│   │   ├── vector_store.py           # ChromaDB / Milvus
│   │   └── metadata_store.py         # PostgreSQL / MongoDB
│   ├── models/                       # Pydantic 数据模型
│   │   ├── __init__.py
│   │   ├── character.py              # 角色模型
│   │   ├── relationship.py           # 关系模型
│   │   ├── event.py                  # 事件模型
│   │   ├── memory.py                 # 记忆模型
│   │   ├── behavior_tree.py          # 行为树模型
│   │   └── evaluation.py             # 评估模型
│   └── utils/                        # 工具函数
│       ├── __init__.py
│       ├── text_utils.py
│       └── logging.py
├── tests/                            # 测试
│   ├── __init__.py
│   ├── unit/                         # 单元测试
│   ├── integration/                  # 集成测试
│   └── fixtures/                     # 测试数据
├── frontend/                         # Streamlit / React 前端
│   └── app.py                        # Streamlit 快速原型
├── scripts/                          # 运维脚本
│   ├── init_neo4j.cypher             # Neo4j 初始化脚本
│   └── seed_data.py                  # 数据种子
└── docs/                             # 文档
    ├── architecture.md
    └── api.md
```

---

## 十三、核心代码参考

### 13.1 Neo4j Schema 初始化脚本

```cypher
// scripts/init_neo4j.cypher

// 创建约束和索引
CREATE CONSTRAINT character_id IF NOT EXISTS
FOR (c:Character) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT event_id IF NOT EXISTS
FOR (e:Event) REQUIRE e.id IS UNIQUE;

CREATE INDEX character_name IF NOT EXISTS
FOR (c:Character) ON (c.name);

CREATE INDEX relation_type IF NOT EXISTS
FOR ()-[r:RELATION]-() ON (r.type);

// 创建示例数据（可选）
CREATE (c1:Character {
  id: "char_001",
  name: "李世民",
  aliases: ["秦王", "二郎", "天可汗"],
  gender: "男",
  faction: "唐",
  firstAppearance: "chapter_1",
  appearance: "方面大耳，凤目龙瞳，英姿勃发",
  personalityKeywords: ["果决", "隐忍", "雄才大略", "重情重义"],
  socialClass: "皇族",
  birthYear: "598",
  importance: 5
})

CREATE (c2:Character {
  id: "char_002",
  name: "李渊",
  aliases: ["唐高祖", "陛下"],
  gender: "男",
  faction: "唐",
  firstAppearance: "chapter_1",
  appearance: "体态丰腴，面容慈祥",
  personalityKeywords: ["宽厚", "优柔", "重家族"],
  socialClass: "皇帝",
  birthYear: "566",
  importance: 4
})

CREATE (c3:Character {
  id: "char_003",
  name: "李建成",
  aliases: ["太子", "大哥"],
  gender: "男",
  faction: "唐",
  firstAppearance: "chapter_2",
  appearance: "身材修长，眉目温和",
  personalityKeywords: ["谨慎", "多疑", "守成"],
  socialClass: "皇族",
  birthYear: "589",
  importance: 4
})

CREATE (e1:Event {
  id: "evt_001",
  description: "玄武门之变",
  importance: 5,
  location: "长安玄武门",
  timeMarker: "武德九年六月初四",
  summary: "李世民在玄武门发动政变，杀死太子李建成和齐王李元吉"
})

CREATE (c1)-[:RELATION {
  type: "父子",
  strength: 5,
  description: "李渊是李世民的父亲",
  isTimeVariant: false,
  startTime: "598"
}]->(c2)

CREATE (c1)-[:RELATION {
  type: "兄弟",
  strength: 2,
  description: "同父异母兄弟，政治对手",
  isTimeVariant: true,
  startTime: "589",
  endTime: "626",
  evolution: "从童年亲近到政治敌对"
}]->(c3)

CREATE (c1)-[:PARTICIPATE {
  role: "主导者",
  motivation: "自保与夺权"
}]->(e1)

CREATE (c2)-[:PARTICIPATE {
  role: "被动参与者",
  motivation: "被迫接受"
}]->(e1)

CREATE (c3)-[:PARTICIPATE {
  role: "受害者",
  motivation: "维护太子之位"
}]->(e1);
```

### 13.2 角色 Agent Harness 核心类

```python
# src/core/stage3/character_agent.py

from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
import asyncio
from enum import Enum

class NodeType(Enum):
    SELECTOR = "selector"
    SEQUENCE = "sequence"
    CONDITION = "condition"
    ACTION = "action"

@dataclass
class BehaviorTreeNode:
    node_type: NodeType
    name: str
    condition: Optional[str] = None
    action: Optional[str] = None
    children: List['BehaviorTreeNode'] = field(default_factory=list)

@dataclass
class MemoryEntry:
    content: str
    timestamp: datetime
    emotional_valence: float  # -1 to 1
    importance: int  # 1-5
    related_characters: List[str] = field(default_factory=list)
    source: str = "extracted"  # extracted / dialogue / summary

@dataclass
class RoleProfile:
    character_id: str
    name: str
    aliases: List[str]
    gender: str
    faction: str
    social_class: str
    appearance: str
    personality_keywords: List[str]
    core_beliefs: List[str]
    taboos: List[str]
    relationships: Dict[str, Any]  # char_id -> relationship detail
    known_facts: List[str]
    unknown_facts: List[str]
    speaking_style: List[str]  # few-shot examples
    behavior_guidelines: List[str]

class MemoryBank:
    def __init__(self, vector_store, metadata_store):
        self.short_term: deque = deque(maxlen=20)
        self.vector_store = vector_store
        self.metadata_store = metadata_store
        self.semantic_memory: Dict[str, str] = {}

    async def add_short_term(self, entry: MemoryEntry):
        self.short_term.append(entry)
        if len(self.short_term) >= 20:
            await self._compress_to_long_term()

    async def _compress_to_long_term(self):
        old_memories = list(self.short_term)[:10]
        summary = await self._summarize_memories(old_memories)
        await self.vector_store.add(
            content=summary,
            metadata={
                "timestamp": datetime.now().isoformat(),
                "type": "summary",
                "source_memories": [m.content for m in old_memories]
            }
        )

    async def retrieve(self, query: str, k: int = 5) -> List[MemoryEntry]:
        # 加权检索：相似度 + 时效性 + 重要性
        candidates = await self.vector_store.similarity_search(query, k=k*3)
        scored = []
        for doc in candidates:
            similarity = doc.score
            recency = self._compute_recency(doc.metadata["timestamp"])
            importance = doc.metadata.get("importance", 3) / 5.0
            score = 0.5 * similarity + 0.3 * recency + 0.2 * importance
            scored.append((score, doc))
        scored.sort(reverse=True)
        return [self._doc_to_memory(d) for _, d in scored[:k]]

    def _compute_recency(self, timestamp: str) -> float:
        dt = datetime.fromisoformat(timestamp)
        days_ago = (datetime.now() - dt).days
        return max(0, 1 - days_ago / 365)  # 一年内线性衰减

class BehaviorTreeExecutor:
    def __init__(self, llm_client):
        self.llm = llm_client
        self.execution_path: List[str] = []

    async def execute(self, root: BehaviorTreeNode, context: Dict[str, Any]) -> str:
        self.execution_path = []
        result = await self._evaluate_node(root, context)
        return result

    async def _evaluate_node(self, node: BehaviorTreeNode, context: Dict[str, Any]) -> str:
        self.execution_path.append(node.name)

        if node.node_type == NodeType.SELECTOR:
            for child in node.children:
                result = await self._evaluate_node(child, context)
                if result:
                    return result
            return ""

        elif node.node_type == NodeType.SEQUENCE:
            results = []
            for child in node.children:
                result = await self._evaluate_node(child, context)
                if not result:
                    return ""
                results.append(result)
            return "\n".join(results)

        elif node.node_type == NodeType.CONDITION:
            # 用 LLM 或规则引擎判断条件
            return await self._evaluate_condition(node.condition, context)

        elif node.node_type == NodeType.ACTION:
            return await self._execute_action(node.action, context)

    async def _evaluate_condition(self, condition: str, context: Dict[str, Any]) -> str:
        # 简化版：直接调用 LLM 判断
        prompt = f"判断以下条件是否满足（只回答 true/false）：\n条件：{condition}\n情境：{context}"
        result = await self.llm.generate(prompt, max_tokens=10)
        return "true" in result.lower()

    async def _execute_action(self, action: str, context: Dict[str, Any]) -> str:
        prompt = f"""
        你是{context['character_name']}，当前情境：{context['situation']}
        你的决策路径：{' -> '.join(self.execution_path)}
        相关记忆：{context.get('memories', [])}

        请先输出 Thought（说明你的决策理由），再输出 Action（具体回复）。
        当前动作：{action}
        """
        return await self.llm.generate(prompt)

class GuardrailLayer:
    def __init__(self, profile: RoleProfile):
        self.profile = profile

    def validate(self, response: str, context: Dict[str, Any]) -> Dict[str, Any]:
        violations = []

        # 知识边界检查
        for fact in self.profile.unknown_facts:
            if fact.lower() in response.lower():
                violations.append(f"知识越界：提到了不应知道的信息 '{fact}'")

        # 禁忌检查
        for taboo in self.profile.taboos:
            if taboo.lower() in response.lower():
                violations.append(f"触犯禁忌：'{taboo}'")

        # 语言风格检查（简化版：检查是否出现现代词汇）
        modern_words = ["互联网", "手机", "电脑", "汽车", "飞机"]
        for word in modern_words:
            if word in response:
                violations.append(f"时代错误：使用了现代词汇 '{word}'")

        return {
            "is_valid": len(violations) == 0,
            "violations": violations,
            "response": response
        }

class CharacterAgent:
    def __init__(self, profile: RoleProfile, memory: MemoryBank, bt: BehaviorTreeNode, llm_client):
        self.profile = profile
        self.memory = memory
        self.behavior_tree = bt
        self.bt_executor = BehaviorTreeExecutor(llm_client)
        self.guardrail = GuardrailLayer(profile)
        self.llm = llm_client

    async def respond(self, dialogue_context: Dict[str, Any]) -> Dict[str, Any]:
        # 1. 感知层：检索记忆
        query = dialogue_context.get("last_message", "")
        memories = await self.memory.retrieve(query)
        dialogue_context["memories"] = memories

        # 2. 决策层：行为树执行
        raw_response = await self.bt_executor.execute(self.behavior_tree, dialogue_context)

        # 3. 护栏层：一致性检查
        validation = self.guardrail.validate(raw_response, dialogue_context)

        if not validation["is_valid"]:
            # 触发修复或降级
            raw_response = await self._repair_response(validation["violations"], dialogue_context)

        # 4. 更新记忆
        await self.memory.add_short_term(MemoryEntry(
            content=f"User: {query}\n{self.profile.name}: {raw_response}",
            timestamp=datetime.now(),
            emotional_valence=0.0,  # 可由情感分析模型补充
            importance=3,
            related_characters=dialogue_context.get("participants", [])
        ))

        return {
            "character_id": self.profile.character_id,
            "character_name": self.profile.name,
            "response": raw_response,
            "execution_path": self.bt_executor.execution_path,
            "memories_used": [m.content for m in memories],
            "validation": validation
        }

    async def _repair_response(self, violations: List[str], context: Dict[str, Any]) -> str:
        prompt = f"""
        你是{self.profile.name}，之前的回复存在以下问题：
        {chr(10).join(violations)}

        请重新生成回复，确保避免上述问题。
        情境：{context}
        """
        return await self.llm.generate(prompt)
```

### 13.3 FastAPI 最小可运行 Demo

```python
# src/api/main.py

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
import asyncio

from src.core.llm.openai_client import OpenAIClient
from src.core.stage1.document_parser import DocumentParser
from src.core.stage1.entity_extractor import EntityExtractor
from src.storage.neo4j_client import Neo4jClient
from src.storage.vector_store import ChromaVectorStore

app = FastAPI(title="Novel Agent Harness API", version="0.1.0")

# 全局依赖（实际应用中使用依赖注入）
llm_client = OpenAIClient()
neo4j_client = Neo4jClient()
vector_store = ChromaVectorStore()

class ParseRequest(BaseModel):
    file_path: str
    file_type: str = "auto"  # auto / pdf / docx / txt / md

class ParseResponse(BaseModel):
    job_id: str
    status: str
    characters_extracted: int = 0
    relationships_extracted: int = 0

class CharacterChatRequest(BaseModel):
    character_id: str
    message: str
    session_id: str

class CharacterChatResponse(BaseModel):
    character_id: str
    character_name: str
    response: str
    execution_path: List[str]
    memories_used: List[str]

@app.post("/pipeline/parse", response_model=ParseResponse)
async def parse_document(request: ParseRequest):
    """Stage 1: 解析文档并构建知识图谱"""
    try:
        # 1. 解析文档
        parser = DocumentParser()
        text = await parser.parse(request.file_path, request.file_type)

        # 2. 语义分块
        chunks = parser.chunk(text)

        # 3. 实体抽取
        extractor = EntityExtractor(llm_client)
        all_entities = []
        all_relations = []

        for chunk in chunks:
            entities, relations = await extractor.extract(chunk)
            all_entities.extend(entities)
            all_relations.extend(relations)

        # 4. 实体消歧 + 写入 Neo4j
        # ... (简化展示)

        return ParseResponse(
            job_id="job_001",
            status="completed",
            characters_extracted=len(all_entities),
            relationships_extracted=len(all_relations)
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/characters/chat", response_model=CharacterChatResponse)
async def chat_with_character(request: CharacterChatRequest):
    """与角色 Agent 对话"""
    try:
        # 从 Neo4j 加载角色 Profile
        # 初始化 MemoryBank 和 BehaviorTree
        # 调用 CharacterAgent.respond()

        # 简化示例返回
        return CharacterChatResponse(
            character_id=request.character_id,
            character_name="李世民",
            response="朕今日心绪不宁，卿有何事禀报？",
            execution_path=["日常决策", "无紧急军情", "无内政事务", "巡视领地"],
            memories_used=["昨日与魏征讨论朝政"]
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/characters/{character_id}/profile")
async def get_character_profile(character_id: str):
    """获取角色完整 Profile"""
    profile = await neo4j_client.get_character(character_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Character not found")
    return profile

@app.get("/health")
async def health_check():
    return {"status": "healthy", "services": ["api", "neo4j", "vector_store"]}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 13.4 Streamlit 前端原型

```python
# frontend/app.py

import streamlit as st
import requests

API_BASE = "http://localhost:8000"

st.set_page_config(page_title="Novel Agent Harness", layout="wide")

st.title("📚 架空历史角色 Agent Harness")

# 侧边栏导航
page = st.sidebar.radio("导航", ["文档解析", "知识图谱", "角色对话", "质量评估"])

if page == "文档解析":
    st.header("Stage 1: 文档解析与结构化")

    uploaded_file = st.file_uploader("上传世界观文档", type=["pdf", "docx", "txt", "md"])

    if uploaded_file and st.button("开始解析"):
        with st.spinner("解析中..."):
            # 调用 API
            response = requests.post(
                f"{API_BASE}/pipeline/parse",
                json={"file_path": f"/tmp/{uploaded_file.name}", "file_type": "auto"}
            )
            if response.status_code == 200:
                result = response.json()
                st.success(f"解析完成！提取角色 {result['characters_extracted']} 个，关系 {result['relationships_extracted']} 条")
            else:
                st.error(f"解析失败: {response.text}")

elif page == "知识图谱":
    st.header("知识图谱可视化")

    # 查询角色列表
    st.info("此处集成 Neo4j Browser 或 pyvis 网络图")

    character_name = st.text_input("搜索角色", "李世民")
    if st.button("查询"):
        st.json({
            "name": character_name,
            "relations": [
                {"target": "李渊", "type": "父子", "strength": 5},
                {"target": "李建成", "type": "兄弟", "strength": 2}
            ]
        })

elif page == "角色对话":
    st.header("Stage 3: 角色交互")

    col1, col2 = st.columns([1, 2])

    with col1:
        character_id = st.selectbox("选择角色", ["char_001", "char_002", "char_003"])
        if st.button("加载角色"):
            profile = requests.get(f"{API_BASE}/characters/{character_id}/profile").json()
            st.json(profile)

    with col2:
        st.subheader("对话")
        if "messages" not in st.session_state:
            st.session_state.messages = []

        for msg in st.session_state.messages:
            with st.chat_message(msg["role"]):
                st.write(msg["content"])

        if prompt := st.chat_input("输入消息..."):
            st.session_state.messages.append({"role": "user", "content": prompt})
            with st.chat_message("user"):
                st.write(prompt)

            with st.spinner("角色思考中..."):
                response = requests.post(
                    f"{API_BASE}/characters/chat",
                    json={"character_id": character_id, "message": prompt, "session_id": "session_001"}
                ).json()

            st.session_state.messages.append({"role": "assistant", "content": response["response"]})
            with st.chat_message("assistant"):
                st.write(response["response"])
                with st.expander("查看决策路径"):
                    st.write(" -> ".join(response["execution_path"]))
                with st.expander("查看使用的记忆"):
                    for mem in response["memories_used"]:
                        st.write(f"- {mem}")

elif page == "质量评估":
    st.header("Stage 4: 质量评估")

    character_id = st.selectbox("选择被测角色", ["char_001", "char_002", "char_003"])

    if st.button("运行压力测试"):
        with st.spinner("评估中..."):
            st.info("调用评估 Harness，运行 5 大类压力测试场景...")
            # 模拟评估结果
            scores = {
                "人设贴合度": 8.5,
                "逻辑一致性": 9.0,
                "知识边界遵守": 10.0,
                "情感真实性": 7.5,
                "深度与复杂性": 8.0
            }

            col1, col2 = st.columns(2)
            with col1:
                st.bar_chart(scores)
            with col2:
                st.write("### 详细评分")
                for dim, score in scores.items():
                    st.write(f"**{dim}**: {score}/10")

                avg_score = sum(scores.values()) / len(scores)
                if avg_score >= 8:
                    st.success(f"综合评分: {avg_score:.1f} - 通过")
                elif avg_score >= 6:
                    st.warning(f"综合评分: {avg_score:.1f} - 需优化")
                else:
                    st.error(f"综合评分: {avg_score:.1f} - 未通过")

---

## 十四、附录

### 14.1 环境变量配置 (.env.example)

```bash
# LLM API 配置
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
ANTHROPIC_API_KEY=sk-ant-...

# 本地模型（可选）
LOCAL_LLM_URL=http://localhost:11434
LOCAL_LLM_MODEL=qwen2.5:72b

# Neo4j 配置
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# 向量数据库配置
CHROMA_PERSIST_DIR=./chroma_data

# PostgreSQL / MongoDB 配置（可选）
DATABASE_URL=postgresql://user:pass@localhost:5432/novel_harness

# 应用配置
MAX_CONCURRENT_AGENTS=10
TOKEN_RATE_LIMIT=100000  # tokens per minute
DEFAULT_LLM_MODEL=gpt-4o
DEBUG=false
```

### 14.2 依赖清单 (pyproject.toml 节选)

```toml
[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.115"
uvicorn = {extras = ["standard"], version = "^0.32"}
pydantic = "^2.9"
pydantic-settings = "^2.6"
openai = "^1.54"
anthropic = "^0.40"
 instructor = "^1.7"
neo4j = "^5.27"
chromadb = "^0.5"
langchain = "^0.3"
langchain-openai = "^0.2"
jinja2 = "^3.1"
pyyaml = "^6.0"
python-docx = "^1.1"
pymupdf = "^1.24"
marker-pdf = "^1.0"
paddleocr = "^2.9"
streamlit = "^1.40"
pytest = "^8.3"
pytest-asyncio = "^0.24"
httpx = "^0.27"
redis = "^5.2"
```

### 14.3 回归测试 CI 配置

```yaml
# .github/workflows/regression_test.yml
name: Regression Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: |
          pip install poetry
          poetry install

      - name: Start Neo4j
        uses: neo4j-actions/setup-neo4j@v1
        with:
          neo4j-version: "5.27"

      - name: Run regression tests
        run: |
          poetry run python -m pytest tests/regression/ -v

      - name: Compare with baseline
        run: |
          poetry run python scripts/compare_baseline.py

      - name: Upload baseline
        uses: actions/upload-artifact@v4
        with:
          name: evaluation-baseline
          path: baselines/
```

### 14.4 核心概念速查表

| 概念 | 说明 |
|------|------|
| **Harness** | 将 LLM 驾驭为可持续交互智能体的缰绳层框架 |
| **Agent Profile** | 角色的完整配置包（Prompt + 记忆 + 行为树 + 评估） |
| **Behavior Tree** | 定义角色决策优先级的多层树结构 |
| **Memory Bank** | 三层记忆架构（短期/长期/语义） |
| **Guardrail** | 防止知识越界、人设漂移的护栏机制 |
| **Regression Test** | 软件工程概念，确保新版本质量不低于旧版本 |
| **Judge LLM** | 独立于生成模型的裁判模型，用于质量评分 |
| **Macro Analyst** | 从全局视角分析世界观结构的独立 Agent |

---

> 本文档整合了原 idea.txt 的完整设计思路与补充的技术可行性分析、架构选型、实现计划、项目目录结构及核心代码参考。实际开发时建议按 Phase 0 → Phase 1 → Phase 3 MVP 的路径快速验证，再逐步完善 Stage 2 和 Stage 4。
