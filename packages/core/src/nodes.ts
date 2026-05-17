import { defaultAgentPolicy, evaluatePolicy } from "./policy.js";
import type { AgentProfile, NodeDefinition, WorkflowItem } from "./types.js";
import { createHash, createHmac } from "node:crypto";

export function createDefaultNodeRegistry(): NodeDefinition[] {
  return [
    passthroughNode("manual.trigger", "Manual", "Manual workflow entry"),
    passthroughNode("schedule.trigger", "Schedule", "Scheduled workflow entry"),
    passthroughNode("webhook.trigger", "Webhook", "Inbound webhook entry"),
    passthroughNode("github.trigger", "GitHub Trigger", "Inbound GitHub webhook event"),
    passthroughNode("jira.trigger", "Jira Trigger", "Inbound Jira webhook event"),
    passthroughNode("slack.trigger", "Slack Trigger", "Inbound Slack event"),
    passthroughNode("email.trigger", "Email Trigger", "Inbound email event"),
    passthroughNode("form.trigger", "Form Trigger", "Inbound form submission"),
    passthroughNode("error.trigger", "Error Trigger", "Inbound workflow error"),
    passthroughNode("telegram.trigger", "Telegram Trigger", "Inbound Telegram event"),
    passthroughNode("whatsapp.trigger", "WhatsApp Trigger", "Inbound WhatsApp event"),
    passthroughActionNode("group.box", "Group", "Visual grouping container"),
    passthroughActionNode("agent.soul", "Soul", "Reusable agent identity prompt"),
    passthroughActionNode("agent.skill", "Skill Asset", "Reusable agent skill prompt/tool bundle"),
    passthroughActionNode("agent.personality", "Personality", "Reusable agent behavior profile"),
    conditionFilterNode(),
    switchRouteNode(),
    itemLimitNode(),
    itemSplitNode(),
    itemMergeNode(),
    itemSortNode(),
    itemAggregateNode(),
    itemDedupeNode(),
    compareDatasetsNode(),
    editFieldsNode(),
    jsonTransformNode(),
    csvParseNode(),
    xmlNode(),
    htmlExtractNode(),
    rssReadNode(),
    dateTimeNode(),
    cryptoNode(),
    codeNode("code.javascript", "JavaScript"),
    codeNode("code.typescript", "TypeScript"),
    codeNode("code.python", "Python"),
    codeNode("code.bash", "Bash Script"),
    codeNode("code.powershell", "PowerShell"),
    codeNode("code.go", "Go"),
    codeNode("code.rust", "Rust"),
    codeNode("code.java", "Java"),
    codeNode("code.csharp", "C#"),
    codeNode("code.php", "PHP"),
    codeNode("code.ruby", "Ruby"),
    codeNode("code.lua", "Lua"),
    codeNode("code.perl", "Perl"),
    codeNode("code.r", "R"),
    codeNode("code.c", "C"),
    codeNode("code.cpp", "C++"),
    codeNode("code.sql", "SQL Script"),
    regexNode(),
    jqNode(),
    policyPlaceholderNode("cache.store", "Cache Store", "Cache key/value boundary placeholder", "cache.store", "write"),
    policyPlaceholderNode("queue.publish", "Queue Publish", "Queue publish boundary placeholder", "queue.publish", "external-send"),
    textTemplateNode(),
    httpRequestNode(),
    webhookResponseNode(),
    waitNode(),
    workflowExecuteNode(),
    approvalNode(),
    stopAndErrorNode(),
    notifyNode(),
    agentNode(),
    policyPlaceholderNode("git.action", "Git", "Git repository operation", "git.status", "read"),
    policyPlaceholderNode("file.action", "File", "File read/write operation", "file.read", "read"),
    policyPlaceholderNode("test.run", "Run Tests", "Approved test command", "shell.run", "write"),
    policyPlaceholderNode("database.query", "Database Query", "Database read query", "db.query", "read"),
    policyPlaceholderNode("docker.action", "Docker", "Docker inspect or approved command", "docker.inspect", "read"),
    policyPlaceholderNode("telegram.send", "Telegram Send", "Telegram outbound message", "telegram.send", "external-send"),
    policyPlaceholderNode("whatsapp.send", "WhatsApp Send", "WhatsApp outbound message", "whatsapp.send", "external-send"),
    policyPlaceholderNode("discord.send", "Discord", "Discord outbound message", "discord.send", "external-send"),
    policyPlaceholderNode("slack.send", "Slack", "Slack outbound message", "slack.send", "external-send"),
    policyPlaceholderNode("email.send", "Email Send", "SMTP outbound message", "email.send", "external-send", {
      smtpHost: "",
      smtpPort: 587,
      encryption: "STARTTLS",
      authMethod: "password",
      username: "",
      from: "",
      to: "",
      subject: "",
      emailType: "text",
      body: "{{message}}"
    }),
    policyPlaceholderNode("gmail.action", "Gmail", "Gmail operation", "gmail.action", "external-send"),
    policyPlaceholderNode("google.sheets", "Google Sheets", "Google Sheets operation", "google.sheets", "write"),
    policyPlaceholderNode("google.drive", "Google Drive", "Google Drive operation", "google.drive", "write"),
    policyPlaceholderNode("notion.action", "Notion", "Notion operation", "notion.action", "write"),
    policyPlaceholderNode("airtable.action", "Airtable", "Airtable operation", "airtable.action", "write"),
    policyPlaceholderNode("hubspot.action", "HubSpot", "HubSpot operation", "hubspot.action", "write"),
    policyPlaceholderNode("trello.action", "Trello", "Trello operation", "trello.action", "write"),
    policyPlaceholderNode("linear.action", "Linear", "Linear operation", "linear.action", "write"),
    policyPlaceholderNode("jira.action", "Jira", "Jira operation", "jira.action", "write"),
    policyPlaceholderNode("github.action", "GitHub", "GitHub operation", "github.action", "write"),
    policyPlaceholderNode("s3.action", "S3", "Object storage operation", "s3.action", "write"),
    policyPlaceholderNode("ftp.action", "FTP/SFTP", "FTP/SFTP operation", "ftp.action", "write"),
    policyPlaceholderNode("redis.action", "Redis", "Redis operation", "redis.action", "write"),
    policyPlaceholderNode("mongodb.action", "MongoDB", "MongoDB operation", "mongodb.action", "write"),
    policyPlaceholderNode("elasticsearch.action", "Elasticsearch", "Elasticsearch operation", "elasticsearch.action", "read"),
    policyPlaceholderNode("shell.action", "Shell", "Container sandbox shell operation", "shell.run", "write"),
    policyPlaceholderNode("ssh.action", "SSH", "Server ops SSH operation", "ssh.inspect", "read")
  ];
}

function passthroughNode(type: string, label: string, description: string): NodeDefinition {
  return {
    type,
    kind: "trigger",
    label,
    description,
    defaultConfig: {},
    async run(ctx) {
      return { status: "completed", items: ctx.input.length > 0 ? ctx.input : [{ json: {} }] };
    }
  };
}

function passthroughActionNode(type: string, label: string, description: string): NodeDefinition {
  return {
    type,
    kind: "action",
    label,
    description,
    defaultConfig: {},
    async run(ctx) {
      return { status: "completed", items: ctx.input.length > 0 ? ctx.input : [{ json: ctx.node.config }] };
    }
  };
}

function jsonTransformNode(): NodeDefinition {
  return {
    type: "json.transform",
    kind: "action",
    label: "JSON Transform",
    description: "Merge static JSON into every item.",
    defaultConfig: { assign: {} },
    async run(ctx) {
      const assign = asObject(ctx.node.config.assign);
      return {
        status: "completed",
        items: ctx.input.map((item) => ({
          ...item,
          json: {
            ...item.json,
            ...resolveTemplateObject(assign, item.json)
          }
        }))
      };
    }
  };
}

function conditionFilterNode(): NodeDefinition {
  return {
    type: "condition.filter",
    kind: "action",
    label: "IF / Filter",
    description: "Keep items matching a field condition.",
    defaultConfig: { field: "status", operator: "exists", value: "" },
    async run(ctx) {
      const field = String(ctx.node.config.field ?? "");
      const operator = String(ctx.node.config.operator ?? "exists");
      const expected = ctx.node.config.value;
      return {
        status: "completed",
        items: ctx.input.filter((item) => matchesCondition(getPath(item.json, field), operator, expected))
      };
    }
  };
}

function switchRouteNode(): NodeDefinition {
  return {
    type: "switch.route",
    kind: "action",
    label: "Switch",
    description: "Annotate items with a branch name based on a field value.",
    defaultConfig: { field: "status", rules: {}, fallback: "default" },
    async run(ctx) {
      const field = String(ctx.node.config.field ?? "");
      const rules = asObject(ctx.node.config.rules);
      const fallback = String(ctx.node.config.fallback ?? "default");
      return {
        status: "completed",
        items: ctx.input.map((item) => {
          const value = String(getPath(item.json, field) ?? "");
          return {
            ...item,
            json: {
              ...item.json,
              branch: typeof rules[value] === "string" ? rules[value] : fallback
            }
          };
        })
      };
    }
  };
}

function itemLimitNode(): NodeDefinition {
  return {
    type: "item.limit",
    kind: "action",
    label: "Limit Items",
    description: "Keep the first N workflow items.",
    defaultConfig: { limit: 10 },
    async run(ctx) {
      const limit = Math.max(0, Number(ctx.node.config.limit ?? 10));
      return { status: "completed", items: ctx.input.slice(0, Number.isFinite(limit) ? limit : 10) };
    }
  };
}

function itemSplitNode(): NodeDefinition {
  return {
    type: "item.split",
    kind: "action",
    label: "Split Out",
    description: "Split an array field into separate items.",
    defaultConfig: { field: "items" },
    async run(ctx) {
      const field = String(ctx.node.config.field ?? "items");
      const items = ctx.input.flatMap((item) => {
        const value = getPath(item.json, field);
        if (!Array.isArray(value)) {
          return [item];
        }
        return value.map((entry, index) => ({
          json: {
            ...item.json,
            item: entry,
            itemIndex: index
          },
          binary: item.binary
        }));
      });
      return { status: "completed", items };
    }
  };
}

function itemMergeNode(): NodeDefinition {
  return {
    type: "item.merge",
    kind: "action",
    label: "Merge Items",
    description: "Combine all incoming items into one array field.",
    defaultConfig: { outputField: "items" },
    async run(ctx) {
      const outputField = String(ctx.node.config.outputField ?? "items");
      return {
        status: "completed",
        items: [
          {
            json: {
              [outputField]: ctx.input.map((item) => item.json),
              count: ctx.input.length
            }
          }
        ]
      };
    }
  };
}

function itemSortNode(): NodeDefinition {
  return {
    type: "item.sort",
    kind: "action",
    label: "Sort Items",
    description: "Sort items by one field.",
    defaultConfig: { field: "createdAt", direction: "asc" },
    async run(ctx) {
      const field = String(ctx.node.config.field ?? "");
      const direction = String(ctx.node.config.direction ?? "asc");
      const items = [...ctx.input].sort((left, right) => compareValues(getPath(left.json, field), getPath(right.json, field)));
      return { status: "completed", items: direction === "desc" ? items.reverse() : items };
    }
  };
}

function itemAggregateNode(): NodeDefinition {
  return {
    type: "item.aggregate",
    kind: "action",
    label: "Aggregate Items",
    description: "Group items and calculate count/sum/average.",
    defaultConfig: { groupBy: "type", operation: "count", valueField: "" },
    async run(ctx) {
      const groupBy = String(ctx.node.config.groupBy ?? "");
      const operation = String(ctx.node.config.operation ?? "count");
      const valueField = String(ctx.node.config.valueField ?? "");
      const groups = new Map<string, WorkflowItem[]>();
      for (const item of ctx.input) {
        const key = groupBy ? String(getPath(item.json, groupBy) ?? "") : "all";
        groups.set(key, [...(groups.get(key) ?? []), item]);
      }
      return {
        status: "completed",
        items: [...groups.entries()].map(([key, items]) => {
          const values = items.map((item) => Number(getPath(item.json, valueField) ?? 0)).filter(Number.isFinite);
          const sum = values.reduce((total, value) => total + value, 0);
          return {
            json: {
              group: key,
              count: items.length,
              value: operation === "sum" ? sum : operation === "average" ? (values.length ? sum / values.length : 0) : items.length
            }
          };
        })
      };
    }
  };
}

function itemDedupeNode(): NodeDefinition {
  return {
    type: "item.dedupe",
    kind: "action",
    label: "Remove Duplicates",
    description: "Remove duplicate items by key field.",
    defaultConfig: { keyField: "id", keep: "first" },
    async run(ctx) {
      const keyField = String(ctx.node.config.keyField ?? "id");
      const keep = String(ctx.node.config.keep ?? "first");
      const seen = new Map<string, WorkflowItem>();
      for (const item of ctx.input) {
        const key = String(getPath(item.json, keyField) ?? JSON.stringify(item.json));
        if (keep === "last" || !seen.has(key)) {
          seen.set(key, item);
        }
      }
      return { status: "completed", items: [...seen.values()] };
    }
  };
}

function compareDatasetsNode(): NodeDefinition {
  return {
    type: "compare.datasets",
    kind: "action",
    label: "Compare Datasets",
    description: "Compare items by a match field and mark duplicates/unique values.",
    defaultConfig: { matchField: "id", output: "differences" },
    async run(ctx) {
      const matchField = String(ctx.node.config.matchField ?? "id");
      const counts = new Map<string, number>();
      for (const item of ctx.input) {
        const key = String(getPath(item.json, matchField) ?? "");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return {
        status: "completed",
        items: ctx.input.map((item) => {
          const key = String(getPath(item.json, matchField) ?? "");
          return { ...item, json: { ...item.json, compareKey: key, compareStatus: (counts.get(key) ?? 0) > 1 ? "duplicate" : "unique" } };
        })
      };
    }
  };
}

function editFieldsNode(): NodeDefinition {
  return {
    type: "edit.fields",
    kind: "action",
    label: "Edit Fields",
    description: "Set static/template fields on each item.",
    defaultConfig: { fields: {} },
    async run(ctx) {
      const fields = asObject(ctx.node.config.fields);
      return {
        status: "completed",
        items: ctx.input.map((item) => ({
          ...item,
          json: {
            ...item.json,
            ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, typeof value === "string" ? renderTemplate(value, item.json) : value]))
          }
        }))
      };
    }
  };
}

function textTemplateNode(): NodeDefinition {
  return {
    type: "text.template",
    kind: "action",
    label: "Text Template",
    description: "Create text from item fields.",
    defaultConfig: { field: "message", template: "Result: {{json}}" },
    async run(ctx) {
      const field = String(ctx.node.config.field ?? "message");
      const template = String(ctx.node.config.template ?? "{{json}}");
      return {
        status: "completed",
        items: ctx.input.map((item) => ({
          ...item,
          json: {
            ...item.json,
            [field]: renderTemplate(template, item.json)
          }
        }))
      };
    }
  };
}

function csvParseNode(): NodeDefinition {
  return {
    type: "csv.parse",
    kind: "action",
    label: "CSV Parse",
    description: "Parse CSV text into items.",
    defaultConfig: { sourceField: "csv", delimiter: ",", hasHeader: true },
    async run(ctx) {
      const sourceField = String(ctx.node.config.sourceField ?? "csv");
      const delimiter = String(ctx.node.config.delimiter ?? ",");
      const hasHeader = ctx.node.config.hasHeader !== false;
      return {
        status: "completed",
        items: ctx.input.flatMap((item) => parseCsv(String(getPath(item.json, sourceField) ?? ""), delimiter, hasHeader).map((json) => ({ json })))
      };
    }
  };
}

function xmlNode(): NodeDefinition {
  return {
    type: "xml.parse",
    kind: "action",
    label: "XML",
    description: "Extract basic XML text and attributes.",
    defaultConfig: { operation: "parse", field: "xml" },
    async run(ctx) {
      const field = String(ctx.node.config.field ?? "xml");
      return {
        status: "completed",
        items: ctx.input.map((item) => ({
          ...item,
          json: {
            ...item.json,
            xml: parseSimpleXml(String(getPath(item.json, field) ?? ""))
          }
        }))
      };
    }
  };
}

function htmlExtractNode(): NodeDefinition {
  return {
    type: "html.extract",
    kind: "action",
    label: "HTML Extract",
    description: "Extract text or attributes from simple HTML selectors.",
    defaultConfig: { htmlField: "html", selector: "title", returnValue: "text", attribute: "href" },
    async run(ctx) {
      const htmlField = String(ctx.node.config.htmlField ?? "html");
      const selector = String(ctx.node.config.selector ?? "title");
      const returnValue = String(ctx.node.config.returnValue ?? "text");
      const attribute = String(ctx.node.config.attribute ?? "href");
      return {
        status: "completed",
        items: ctx.input.map((item) => ({
          ...item,
          json: {
            ...item.json,
            extracted: extractHtml(String(getPath(item.json, htmlField) ?? ""), selector, returnValue, attribute)
          }
        }))
      };
    }
  };
}

function rssReadNode(): NodeDefinition {
  return {
    type: "rss.read",
    kind: "action",
    label: "RSS Read",
    description: "Read RSS or Atom feed items.",
    defaultConfig: { url: "", limit: 20 },
    async run(ctx) {
      const url = String(ctx.node.config.url ?? "");
      if (!url) return { status: "completed", items: [] };
      const response = await fetch(url);
      const xml = await response.text();
      const limit = Math.max(1, Number(ctx.node.config.limit ?? 20));
      return { status: "completed", items: parseRssItems(xml).slice(0, limit).map((json) => ({ json })) };
    }
  };
}

function dateTimeNode(): NodeDefinition {
  return {
    type: "date.time",
    kind: "action",
    label: "Date & Time",
    description: "Parse, format, or offset date fields.",
    defaultConfig: { operation: "format", field: "date", value: "YYYY-MM-DD" },
    async run(ctx) {
      const field = String(ctx.node.config.field ?? "date");
      const operation = String(ctx.node.config.operation ?? "format");
      const value = String(ctx.node.config.value ?? "");
      return {
        status: "completed",
        items: ctx.input.map((item) => {
          const date = new Date(String(getPath(item.json, field) ?? new Date().toISOString()));
          const next = operation === "add" ? addSeconds(date, Number(value || 0)) : operation === "subtract" ? addSeconds(date, -Number(value || 0)) : date;
          return { ...item, json: { ...item.json, [field]: Number.isNaN(next.getTime()) ? null : next.toISOString() } };
        })
      };
    }
  };
}

function cryptoNode(): NodeDefinition {
  return {
    type: "crypto.hash",
    kind: "action",
    label: "Crypto",
    description: "Hash or HMAC a field value.",
    defaultConfig: { operation: "hash", algorithm: "sha256", field: "value", secret: "" },
    async run(ctx) {
      const operation = String(ctx.node.config.operation ?? "hash");
      const algorithm = String(ctx.node.config.algorithm ?? "sha256");
      const field = String(ctx.node.config.field ?? "value");
      const secret = String(ctx.node.config.secret ?? "");
      return {
        status: "completed",
        items: ctx.input.map((item) => {
          const raw = String(getPath(item.json, field) ?? "");
          const output = operation === "hmac" ? createHmac(algorithm, secret).update(raw).digest("hex") : createHash(algorithm).update(raw).digest("hex");
          return { ...item, json: { ...item.json, [`${field}Hash`]: output } };
        })
      };
    }
  };
}

function httpRequestNode(): NodeDefinition {
  return {
    type: "http.request",
    kind: "action",
    label: "HTTP",
    description: "Make an HTTP request.",
    defaultConfig: { method: "GET", url: "https://example.com", headers: {}, query: {}, bodyType: "none", bodyText: "" },
    async run(ctx) {
      const method = String(ctx.node.config.method ?? "GET");
      const bodyType = String(ctx.node.config.bodyType ?? "none");
      const bodyText = String(ctx.node.config.bodyText ?? "");
      const headersConfig = asObject(ctx.node.config.headers);
      const queryConfig = asObject(ctx.node.config.query);
      const items = await Promise.all(ctx.input.map(async (item) => {
        const url = new URL(renderTemplate(String(ctx.node.config.url ?? ""), item.json));
        for (const [key, value] of Object.entries(resolveTemplateObject(queryConfig, item.json))) {
          if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
        }
        const headers = Object.fromEntries(Object.entries(resolveTemplateObject(headersConfig, item.json)).map(([key, value]) => [key, String(value)]));
        const response = await fetch(url, {
          method,
          headers,
          body: method === "GET" || bodyType === "none" ? undefined : renderTemplate(bodyText, item.json)
        });
        const text = await response.text();
        return {
          json: {
            ...item.json,
            http: {
              status: response.status,
              headers: headersToObject(response.headers),
              body: tryJson(text) ?? text
            }
          },
          binary: item.binary
        };
      }));
      return {
        status: "completed",
        items
      };
    }
  };
}

function webhookResponseNode(): NodeDefinition {
  return {
    type: "webhook.response",
    kind: "action",
    label: "Webhook Response",
    description: "Prepare response payload for the webhook caller.",
    defaultConfig: { status: 200, body: { ok: true } },
    async run(ctx) {
      return {
        status: "completed",
        items: ctx.input.map((item) => ({
          json: {
            ...item.json,
            webhookResponse: {
              status: Number(ctx.node.config.status ?? 200),
              body: ctx.node.config.body ?? item.json
            }
          },
          binary: item.binary
        }))
      };
    }
  };
}

function approvalNode(): NodeDefinition {
  return {
    type: "approval.request",
    kind: "action",
    label: "Approval",
    description: "Pause workflow until approved.",
    defaultConfig: { message: "Approve action?" },
    async run(ctx) {
      const autoApprove = ctx.node.config.autoApprove === true;
      if (autoApprove) {
        return { status: "completed", items: ctx.input };
      }

      ctx.log({
        type: "approval.requested",
        message: String(ctx.node.config.message ?? "Approval requested"),
        data: { nodeId: ctx.node.id }
      });
      return {
        status: "paused",
        items: ctx.input,
        pauseReason: String(ctx.node.config.message ?? "Approval requested")
      };
    }
  };
}

function stopAndErrorNode(): NodeDefinition {
  return {
    type: "stop.error",
    kind: "action",
    label: "Stop And Error",
    description: "Fail the workflow intentionally.",
    defaultConfig: { message: "Workflow stopped by Stop And Error node", code: "STOP_AND_ERROR" },
    async run(ctx) {
      const code = String(ctx.node.config.code ?? "STOP_AND_ERROR");
      const message = String(ctx.node.config.message ?? "Workflow stopped by Stop And Error node");
      throw new Error(`${code}: ${message}`);
    }
  };
}

function notifyNode(): NodeDefinition {
  return {
    type: "notify.send",
    kind: "action",
    label: "Notify",
    description: "Send a notification back to channel/chat.",
    defaultConfig: { channel: "chat", message: "{{json}}" },
    async run(ctx) {
      return {
        status: "completed",
        items: ctx.input.map((item) => ({
          json: {
            ...item.json,
            notification: ctx.node.config.message ?? item.json
          }
        }))
      };
    }
  };
}

function waitNode(): NodeDefinition {
  return {
    type: "wait.delay",
    kind: "action",
    label: "Wait",
    description: "Pause workflow for approval-style resume in v1.",
    defaultConfig: { resumeMode: "delay", delaySeconds: 60 },
    async run(ctx) {
      const delaySeconds = Number(ctx.node.config.delaySeconds ?? 60);
      ctx.log({
        type: "approval.requested",
        message: `Wait node paused for ${delaySeconds} seconds`,
        data: { nodeId: ctx.node.id, delaySeconds }
      });
      return { status: "paused", items: ctx.input, pauseReason: `Wait ${delaySeconds}s before resume` };
    }
  };
}

function workflowExecuteNode(): NodeDefinition {
  return {
    type: "workflow.execute",
    kind: "action",
    label: "Execute Workflow",
    description: "Mark sub-workflow execution request.",
    defaultConfig: { workflowRef: "", inputMode: "allItems" },
    async run(ctx) {
      return {
        status: "completed",
        items: ctx.input.map((item) => ({
          ...item,
          json: {
            ...item.json,
            subWorkflow: {
              workflowRef: ctx.node.config.workflowRef ?? "",
              inputMode: ctx.node.config.inputMode ?? "allItems"
            }
          }
        }))
      };
    }
  };
}

function codeNode(type: string, label: string): NodeDefinition {
  return {
    type,
    kind: "action",
    label,
    description: "Approved code execution adapter boundary.",
    defaultConfig: { language: type.replace("code.", ""), code: "", requiresApproval: true },
    async run(ctx) {
      const requiresApproval = ctx.node.config.requiresApproval !== false;
      if (requiresApproval) {
        ctx.log({
          type: "approval.requested",
          message: `${label} code execution needs approval`,
          data: { nodeId: ctx.node.id }
        });
        return { status: "paused", items: ctx.input, pauseReason: `${label} code execution needs approval` };
      }
      return {
        status: "completed",
        items: ctx.input.map((item) => ({
          ...item,
          json: {
            ...item.json,
            codeExecution: {
              language: type.replace("code.", ""),
              status: "approved-boundary",
              code: String(ctx.node.config.code ?? "")
            }
          }
        }))
      };
    }
  };
}

function regexNode(): NodeDefinition {
  return {
    type: "code.regex",
    kind: "action",
    label: "Regex",
    description: "Extract regex matches from a field.",
    defaultConfig: { field: "text", code: "(.*)" },
    async run(ctx) {
      const field = String(ctx.node.config.field ?? "text");
      const pattern = String(ctx.node.config.code ?? "(.*)");
      const regex = new RegExp(pattern, "g");
      return {
        status: "completed",
        items: ctx.input.map((item) => {
          const text = String(getPath(item.json, field) ?? "");
          return { ...item, json: { ...item.json, matches: [...text.matchAll(regex)].map((match) => match[0]) } };
        })
      };
    }
  };
}

function jqNode(): NodeDefinition {
  return {
    type: "code.jq",
    kind: "action",
    label: "jq",
    description: "Pick a JSON path using jq-like dot syntax.",
    defaultConfig: { code: "." },
    async run(ctx) {
      const expression = String(ctx.node.config.code ?? ".");
      const path = expression.startsWith(".") ? expression.slice(1) : expression;
      return {
        status: "completed",
        items: ctx.input.map((item) => ({
          ...item,
          json: {
            ...item.json,
            jq: path ? getPath(item.json, path) : item.json
          }
        }))
      };
    }
  };
}

function agentNode(): NodeDefinition {
  return {
    type: "agent.run",
    kind: "agent",
    label: "AI Agent",
    description: "Run a persistent canvas agent with its own model and skills.",
    defaultConfig: { agentId: "default-agent", inputField: "prompt" },
    async run(ctx) {
      const agentId = String(ctx.node.config.agentId ?? "");
      const agent = applyLinkedAgentAssets(ctx.agents.get(agentId) ?? agentFromNodeConfig(ctx.node.config), ctx.workflow, ctx.node.id);
      const provider = ctx.providers.get(agent.model.provider);
      if (!provider) {
        throw new Error(`Missing model provider: ${agent.model.provider}`);
      }

      const skillInstructions = agent.skills.map((skill) => `Skill: ${skill.name}\n${skill.instructions}`).join("\n\n");
      const system = [agent.soul, agent.personality, skillInstructions].filter(Boolean).join("\n\n");
      const prompt = buildAgentPrompt(agent, ctx.input);

      ctx.log({
        type: "model.call",
        message: `Calling ${agent.model.provider}:${agent.model.model}`,
        data: { agentId: agent.id, intelligence: agent.intelligence }
      });

      const response = await provider.generate({
        model: agent.model,
        intelligence: agent.intelligence,
        system,
        messages: [{ role: "user", content: prompt }],
        tools: []
      });

      return {
        status: "completed",
        items: [
          {
            json: {
              agentId: agent.id,
              agentName: agent.name,
              model: agent.model,
              intelligence: agent.intelligence,
              content: response.content,
              toolCalls: response.toolCalls,
              metadata: response.metadata
            }
          }
        ]
      };
    }
  };
}

function policyPlaceholderNode(
  type: string,
  label: string,
  description: string,
  tool: string,
  risk: "read" | "write" | "destructive" | "external-send",
  defaultConfig: Record<string, unknown> = {}
): NodeDefinition {
  return {
    type,
    kind: "action",
    label,
    description,
    defaultConfig: { tool, target: "*", ...defaultConfig },
    async run(ctx) {
      const policy = agentFromNodeConfig(ctx.node.config).policy;
      const actualTool = String(ctx.node.config.tool ?? tool);
      const target = String(ctx.node.config.target ?? "*");
      const actualRisk = inferRisk(actualTool, risk);
      const decision = evaluatePolicy(policy, { tool: actualTool, risk: actualRisk, target });
      ctx.log({
        type: "policy.decision",
        message: `${actualTool} ${decision.decision}`,
        data: { tool: actualTool, target, risk: actualRisk, reason: decision.reason }
      });

      if (decision.decision === "block") {
        throw new Error(`${actualTool} blocked: ${decision.reason}`);
      }

      if (decision.decision === "approval") {
        return {
          status: "paused",
          items: ctx.input,
          pauseReason: `${actualTool} needs approval for ${target}`
        };
      }

      return {
        status: "completed",
        items: [
          {
            json: {
              tool: actualTool,
              target,
              status: "allowed",
              note: "Execution adapter boundary ready; sandbox runner owns real side effects."
            }
          }
        ]
      };
    }
  };
}

function inferRisk(tool: string, fallback: "read" | "write" | "destructive" | "external-send") {
  if (tool.includes("send") || tool.includes("push")) return "external-send";
  if (tool.includes("delete") || tool.includes("down")) return "destructive";
  if (tool.includes("write") || tool.includes("run")) return "write";
  return fallback;
}

function buildAgentPrompt(agent: AgentProfile, items: WorkflowItem[]): string {
  return [
    `Agent: ${agent.name}`,
    `Memory scope: ${agent.memoryScope}`,
    `Tools: ${agent.toolNames.join(", ") || "none"}`,
    "Workflow input:",
    JSON.stringify(items.map((item) => item.json), null, 2)
  ].join("\n");
}

function agentFromNodeConfig(config: Record<string, unknown>): AgentProfile {
  const modelConfig = asObject(config.model);
  return {
    id: String(config.agentId ?? "inline-agent"),
    name: String(config.name ?? "Inline Agent"),
    model: {
      provider: modelConfig.provider === "openai" || modelConfig.provider === "anthropic" || modelConfig.provider === "ollama" ? modelConfig.provider : "ollama",
      model: typeof modelConfig.model === "string" ? modelConfig.model : "llama3.1"
    },
    intelligence:
      config.intelligence === "off" || config.intelligence === "low" || config.intelligence === "medium" || config.intelligence === "high"
        ? config.intelligence
        : "medium",
    soul: String(config.soul ?? "You are a practical IT and coding agent."),
    personality: String(config.personality ?? "Direct, precise, and careful."),
    skills: [],
    toolNames: Array.isArray(config.tools) ? config.tools.map(String) : [],
    memoryScope: "workflow",
    policy: defaultAgentPolicy
  };
}

function applyLinkedAgentAssets(agent: AgentProfile, workflow: { nodes: Array<{ id: string; type: string; name: string; config: Record<string, unknown> }>; edges: Array<{ source: string; target: string; targetHandle?: string | null }> }, agentNodeId: string): AgentProfile {
  const linkedEdges = workflow.edges.filter((edge) => edge.target === agentNodeId);
  const linkedNodes = linkedEdges
    .map((edge) => ({ edge, node: workflow.nodes.find((candidate) => candidate.id === edge.source) }))
    .filter((entry): entry is { edge: { source: string; target: string; targetHandle?: string | null }; node: { id: string; type: string; name: string; config: Record<string, unknown> } } => Boolean(entry.node));

  const soulNode = linkedNodes.find((entry) => entry.edge.targetHandle === "soul" && entry.node.type === "agent.soul")?.node;
  const personalityNode = linkedNodes.find((entry) => entry.edge.targetHandle === "personality" && entry.node.type === "agent.personality")?.node;
  const skillNodes = linkedNodes.filter((entry) => entry.edge.targetHandle === "skill" && entry.node.type === "agent.skill").map((entry) => entry.node);

  return {
    ...agent,
    soul: soulNode ? String(soulNode.config.soul ?? agent.soul) : agent.soul,
    personality: personalityNode ? String(personalityNode.config.personality ?? agent.personality) : agent.personality,
    skills: [
      ...agent.skills,
      ...skillNodes.map((node) => ({
        id: node.id,
        name: String(node.config.name ?? node.name),
        instructions: `${node.config.toolMode === false ? "Context Skill" : "Tool Mode Skill"}\n${String(node.config.instructions ?? "")}`,
        toolNames: node.config.toolMode === false ? [] : Array.isArray(node.config.toolNames) ? node.config.toolNames.map(String) : []
      }))
    ],
    toolNames: [
      ...agent.toolNames,
      ...skillNodes.flatMap((node) => (node.config.toolMode === false ? [] : Array.isArray(node.config.toolNames) ? node.config.toolNames.map(String) : []))
    ]
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function getPath(source: Record<string, unknown>, path: string): unknown {
  if (!path) {
    return source;
  }
  return path.split(".").reduce<unknown>((current, key) => {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, source);
}

function matchesCondition(actual: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case "exists":
      return actual !== undefined && actual !== null && actual !== "";
    case "notExists":
      return actual === undefined || actual === null || actual === "";
    case "equals":
      return String(actual) === String(expected);
    case "notEquals":
      return String(actual) !== String(expected);
    case "contains":
      return String(actual ?? "").includes(String(expected ?? ""));
    case "greaterThan":
      return Number(actual) > Number(expected);
    case "lessThan":
      return Number(actual) < Number(expected);
    default:
      return Boolean(actual);
  }
}

function renderTemplate(template: string, json: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey: string) => {
    const key = rawKey.trim();
    if (key === "json" || key === "$json") {
      return JSON.stringify(json);
    }
    if (key === "$now") {
      return new Date().toISOString();
    }
    const normalized = key.startsWith("$json.") ? key.slice("$json.".length) : key.startsWith("json.") ? key.slice("json.".length) : key;
    const value = getPath(json, normalized);
    return typeof value === "string" ? value : JSON.stringify(value ?? "");
  });
}

function resolveTemplateObject(source: Record<string, unknown>, json: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      typeof value === "string" ? renderTemplate(value, json) : value
    ])
  );
}

function headersToObject(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key] = value;
  });
  return output;
}

function compareValues(left: unknown, right: unknown): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function parseCsv(text: string, delimiter: string, hasHeader: boolean): Record<string, unknown>[] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => splitCsvLine(line, delimiter))
    .filter((row) => row.some((cell) => cell.trim().length > 0));
  if (rows.length === 0) return [];
  const headers = hasHeader ? rows.shift() ?? [] : (rows[0] ?? []).map((_, index) => `column${index + 1}`);
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header || `column${index + 1}`, row[index] ?? ""])));
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function parseSimpleXml(xml: string): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const match of xml.matchAll(/<([A-Za-z0-9:_-]+)(?:\s[^>]*)?>([^<]*)<\/\1>/g)) {
    const tag = match[1];
    if (tag) {
      output[tag] = decodeXml((match[2] ?? "").trim());
    }
  }
  return output;
}

function extractHtml(html: string, selector: string, returnValue: string, attribute: string): string[] {
  const tag = selector.replace(/^[.#]/, "").split(/[ .#:[\]]/)[0] || "title";
  const regex = new RegExp(`<${tag}([^>]*)>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return [...html.matchAll(regex)].map((match) => {
    if (returnValue === "html") return match[0];
    if (returnValue === "attribute") {
      const attr = new RegExp(`${attribute}=["']([^"']*)["']`, "i").exec(match[1] ?? "");
      return attr?.[1] ?? "";
    }
    return stripTags(match[2] ?? "").trim();
  });
}

function parseRssItems(xml: string): Record<string, unknown>[] {
  const matches = [...xml.matchAll(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi)];
  return matches.map((match) => {
    const block = match[0];
    return {
      title: firstXmlValue(block, "title"),
      link: firstXmlValue(block, "link"),
      description: firstXmlValue(block, "description") || firstXmlValue(block, "summary"),
      publishedAt: firstXmlValue(block, "pubDate") || firstXmlValue(block, "published") || firstXmlValue(block, "updated")
    };
  });
}

function firstXmlValue(xml: string, tag: string): string {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i").exec(xml);
  return match ? stripTags(decodeXml(match[1] ?? "")).trim() : "";
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, "");
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}
