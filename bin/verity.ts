#!/usr/bin/env bun
import { createCli } from "../src/cli/index";

const cli = createCli();
cli.parse(process.argv);
