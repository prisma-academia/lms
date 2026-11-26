import { Fragment, type ReactNode } from "react";
import { parseLessonText, type Inline } from "./lesson-markdown";
import { createHeadingIdAllocator } from "@/lib/content/lesson-headings";

/**
 * Render a plain-text lesson body as React nodes.
 *
 * The parsing rules live in `lesson-markdown.ts`, shared with the HTML
 * serializer the WYSIWYG editor uses — see that file for why the subset is
 * what it is.
 *
 * Elements out, never an HTML string: nothing here reaches
 * `dangerouslySetInnerHTML`, so a TEXT body containing markup is displayed
 * rather than executed, with no sanitizer in the path to get wrong.
 *
 * Styling comes entirely from the `.lesson-prose` class on the container, so
 * this output matches HTML lessons and the editor surface without a second set
 * of rules to keep in sync.
 */

function renderInline(content: Inline[], keyPrefix: string): ReactNode[] {
  return content.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.type === "strong") return <strong key={key}>{part.text}</strong>;
    if (part.type === "em") return <em key={key}>{part.text}</em>;
    if (part.type === "code") return <code key={key}>{part.text}</code>;
    return <Fragment key={key}>{part.text}</Fragment>;
  });
}

export function renderLessonText(text: string): ReactNode {
  // Same allocator, same order, as `textHeadings` in lesson-headings.ts — that
  // is what makes a "read up" link to one of these headings land on it.
  const headingId = createHeadingIdAllocator();
  return parseLessonText(text).map((block, index) => {
    const key = `b${index}`;
    switch (block.kind) {
      case "heading": {
        const Tag = `h${block.level}` as "h2" | "h3" | "h4" | "h5";
        const label = block.content
          .map((part) => part.text)
          .join("")
          .replace(/\s+/g, " ")
          .trim();
        return (
          <Tag key={key} id={headingId(label)}>
            {renderInline(block.content, key)}
          </Tag>
        );
      }
      case "paragraph":
        return <p key={key}>{renderInline(block.content, key)}</p>;
      case "quote":
        return <blockquote key={key}>{renderInline(block.content, key)}</blockquote>;
      case "code":
        return (
          <pre key={key}>
            <code>{block.code}</code>
          </pre>
        );
      case "list": {
        const Tag = block.ordered ? "ol" : "ul";
        return (
          <Tag key={key}>
            {block.items.map((item, i) => (
              <li key={i}>{renderInline(item, `${key}-${i}`)}</li>
            ))}
          </Tag>
        );
      }
    }
  });
}
