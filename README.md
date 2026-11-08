# claude-improvement

给 Claude Code 做的一些小改进（mod）。

## usage-band

输入框上方的一行用量条：

```
5h ▬▬▬ 11% 2h22m  7d ▬▬▬ 26%  |  in 31.9k  out 120  66 t/s  cache 47%  |  ◷ 16:28  $4.02 共 $4.02  ctx ▬▬▬ 6%
```

- **5h / 7d**：两个限额窗口的用量，条的颜色到 75% 变黄、90% 变红；5h 后面是离重置还剩多久。
- **in / out**：本会话新输入（含缓存写入）和输出的 token 数。
- **t/s**：主对话上一次回复的输出速度。
- **cache**：输入里命中缓存的比例。
- **时钟**：当前时间。
- **$今天 共 $本周**：所有会话今天的花费合计，和本周（周一到周日）的合计。
- **ctx**：上下文窗口用了多少。

宽度不够时会依次缩短进度条、去掉 `|`、隐藏时钟/速度/缓存等次要项；宽度有富余时，进度条会变长（最多 8 格），剩下的空间平均分到各项之间。终端和桌面端都能用。

## codex-jobs

Claude 在会话里通过 Bash 调用 [Codex CLI](https://github.com/openai/codex) 时，把这些 Codex 任务收进一个侧边面板，样式仿照原生的 workflow 视图。

- **识别任务**：`codex exec` / `codex e`、`codex review`、`codex resume` / `fork`、`codex cloud exec`、直接 `codex "prompt"`；也能看穿 `nohup`、`timeout`、`env`、`npx @openai/codex`、`bash -lc '…'`、管道和 heredoc 里的 prompt。`login`、`mcp`、`--help` 之类的管理命令会忽略。
- **按阶段分组**：每个启动了任务的用户回合算一个阶段，标题取自那条 prompt。面板够宽时阶段和任务分两栏显示。
- **状态**：Running / Completed / Failed / Stopped / Unknown，带耗时、token 数、工具调用数和模型，从 Codex 的 `--json` 事件或纯文本日志里读。
- **后台任务**：跟踪 `run_in_background` 的任务直到完成通知；打开任务卡片时实时读取输出文件。
- **任务卡片**：prompt、最近的动作（Codex 跑的命令、改的文件、MCP 工具、网页搜索）和最终回答；长文本可以展开/收起。
- **操作**：`stop` / `stop all`（通过 TaskStop）、按状态筛选，输入框下方有 **Codex workflow** 按钮开关面板，`/codex-jobs` 命令也能打开。

第一次有 Codex 任务时面板会自动打开；手动关掉之后用按钮或 `/codex-jobs` 再打开。让 Claude 用 `codex exec --json …` 能拿到最全的统计（token、工具调用、动作）。需要本机装有 `codex` CLI。

## 安装

在 Claude Code 终端会话里输入：

```
/plugin marketplace add BlackSlience-Reaper/claude-improvement
/plugin install usage-band@claude-improvement
/plugin install codex-jobs@claude-improvement
```

或者把克隆下来的插件文件夹直接加进 `~/.claude/settings.json` 的 `env`（多个路径在 Windows 上用 `;` 分隔）：

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "D:/CE/claude-improvement/usage-band;D:/CE/claude-improvement/codex-jobs"
  }
}
```

在桌面端里想改完文件就自动重载，再加一条 `"CLAUDE_CODE_PLUGIN_DIR_WATCH": "1"`；不加的话新开会话才会生效。
