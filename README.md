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

## 安装

在 Claude Code 终端会话里输入：

```
/plugin install usage-band --marketplace BlackSlience-Reaper/claude-improvement
```

或者把克隆下来的 `usage-band` 文件夹直接加进 `~/.claude/settings.json` 的 `env`（多个路径在 Windows 上用 `;` 分隔）：

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "D:/CE/claude-improvement/usage-band"
  }
}
```

在桌面端里想改完文件就自动重载，再加一条 `"CLAUDE_CODE_PLUGIN_DIR_WATCH": "1"`；不加的话新开会话才会生效。
