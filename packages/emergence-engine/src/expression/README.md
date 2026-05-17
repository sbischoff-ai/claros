# Expression Language

## Library choice: jexl

We use **[jexl](https://github.com/TomFrost/Jexl)** (v2.x) as the expression evaluator.

### Why jexl

- Lightweight, synchronous (`evalSync`) and async (`eval`) API
- Dot-path member access (`state.story.mythic.chaos_factor`)
- Built-in `in` operator for array membership (`44 in [11, 22, 33]`)
- Built-in ternary (`condition ? a : b`)
- Extensible binary/unary operators via `addBinaryOp` / `addUnaryOp`
- Missing context paths return `undefined` rather than throwing

### Configuration decisions

#### English boolean keywords

jexl's default grammar uses `&&`, `||`, and `!` for logical operators.
YAML macro conditions are author-facing and should read naturally, so we register
three additional operators with the same precedence (10) as the built-in ones:

| Keyword | Equivalent |
| ------- | ---------- |
| `and`   | `&&`       |
| `or`    | `\|\|`     |
| `not`   | `!`        |

This is done once in `buildJexl()` via `jexl.addBinaryOp` / `jexl.addUnaryOp`.
Both the English and symbolic forms work; do not use both in the same expression.

#### Singleton evaluator

`createEvaluator()` returns a shared singleton. The jexl instance caches compiled
expressions internally, so sharing it is beneficial. If test isolation ever requires
a fresh instance, instantiate `JexlEvaluator` directly (not exported publicly, but
the pattern is stable).

#### `evaluateBool` never throws

`evaluateBool` wraps `evaluate` in a try/catch and coerces the result with `Boolean()`.
A parse error in the expression returns `false` rather than crashing.

#### Missing paths

jexl returns `undefined` for missing dot-path segments without throwing. This is the
built-in behaviour and requires no additional configuration.

### Supported operator reference

| Category   | Syntax                                    |
| ---------- | ----------------------------------------- |
| Arithmetic | `+`, `-`, `*`, `/`, `%`                   |
| Comparison | `==`, `!=`, `<`, `<=`, `>`, `>=`          |
| Boolean    | `and`, `or`, `not` (or `&&`, `\|\|`, `!`) |
| Member     | `a.b.c` dot-path                          |
| Membership | `value in [11, 22, 33]`                   |
| Ternary    | `condition ? a : b`                       |
| String     | `+` concatenation, `in` substring check   |
