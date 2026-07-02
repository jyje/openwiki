# OpenWiki

OpenWiki is a CLI that writes and maintains documentation for your codebase, built specifically for agents.

![OpenWiki](https://raw.githubusercontent.com/langchain-ai/openwiki/main/static/openwiki.png)

## Install

```sh
npm install -g openwiki
```

## Quick Start

Initialize OpenWiki, configure your model and API key, then generate documentation

```sh
openwiki --init
```

Then to ensure your documentation stays up-to-date, add the GitHub action to your repository to automatically open a PR once a day with documentation updates: [openwiki-update.yml](./examples/openwiki-update.yml)

Copy the contents of that file into `.github/workflows/openwiki-update.yml` in your repository.

## Usage

Start the interactive CLI:

```sh
openwiki
```

Start OpenWiki with an initial request:

```sh
openwiki "Please generate documentation for this repository"
```

Run a single command and exit:

```sh
openwiki -p "Summarize what you can do"
```

Initialize OpenWiki:

```sh
openwiki --init
```

Update existing documentation:

```sh
openwiki --update
```

Show help:

```sh
openwiki --help
```

`openwiki` creates initial documentation in `openwiki/` when no wiki exists. If `openwiki/` already exists, it refreshes that documentation from repository changes. By default, the CLI stays open after each run so you can send follow-up messages. Use `-p` or `--print` for a one-shot non-interactive run that prints the final assistant output.

`openwiki` will automatically append prompting to your `AGENTS.md` and/or `CLAUDE.md` files to instruct your coding agent to reference it when searching for context. If the file does not already exist in your repository, OpenWiki will create it for you.

On the first interactive run, OpenWiki will have you configure your inference provider, API key, and LLM. You will also be able to set a LangSmith API key to trace your OpenWiki runs to a LangSmith tracing project named "openwiki" (optional).

These configuration options and secrets will be saved to `~/.openwiki/.env` on your local machine.

## Customizing

OpenWiki supports OpenRouter, Fireworks, Baseten, OpenAI, Anthropic and GitHub Models out of the box. By default, there are a few models pre-defined (GLM 5.2, Kimi K2.6, Sonnet 5, etc) but for each inference provider, OpenWiki will allow you to specify your own custom model ID.

### GitHub Models

The GitHub Models provider (`github-models`) uses the OpenAI-compatible inference endpoint at `https://models.github.ai/inference`. Its model catalog does not include Anthropic models, and the free tier has per-request token limits that can be too small for a full documentation run — check your account's [rate limits](https://docs.github.com/en/github-models/prototyping-with-ai-models#rate-limits) if you hit `413` errors.

1. Create a fine-grained personal access token with the **"Models"** read account permission.
2. Set the token as `GITHUB_MODELS_API_KEY` and select `GitHub Models` during `openwiki --init`, then choose a model (for example `openai/gpt-5-mini`).

Because GitHub Actions reserves secret names starting with `GITHUB_`, the key is also read from `GH_MODELS_API_KEY`. In GitHub Actions you can skip secrets entirely and use the built-in workflow token by granting the job `models: read` permission:

```yaml
permissions:
  models: read
env:
  OPENWIKI_PROVIDER: github-models
  OPENWIKI_MODEL_ID: openai/gpt-5-mini
  GH_MODELS_API_KEY: ${{ secrets.GITHUB_TOKEN }}
```

If there's an inference provider or model you'd like to see added, please open a PR!
