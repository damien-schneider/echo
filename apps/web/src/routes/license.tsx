import { createFileRoute } from "@tanstack/react-router";
import EchoFooter from "@/components/landing/footer";
import { H1, P } from "@/components/ui/typography";

export const Route = createFileRoute("/license")({
  component: LicensePage,
  head: () => ({
    meta: [
      { title: "MIT License — Echo Speech-to-Text" },
      {
        content:
          "Echo is released under the MIT License — free to use, modify, and distribute.",
        name: "description",
      },
      { content: "noindex, follow", name: "robots" },
    ],
  }),
});

function LicensePage() {
  return (
    <div className="min-h-screen bg-background pt-24 font-sans text-foreground">
      <div className="container mx-auto max-w-3xl px-4 pb-20">
        <H1>MIT License</H1>
        <P className="text-muted-foreground">
          Copyright (c) 2025 Damien Schneider
        </P>

        <P>
          Permission is hereby granted, free of charge, to any person obtaining
          a copy of this software and associated documentation files (the
          "Software"), to deal in the Software without restriction, including
          without limitation the rights to use, copy, modify, merge, publish,
          distribute, sublicense, and/or sell copies of the Software, and to
          permit persons to whom the Software is furnished to do so, subject to
          the following conditions:
        </P>

        <P>
          The above copyright notice and this permission notice shall be
          included in all copies or substantial portions of the Software.
        </P>

        <P className="text-sm uppercase">
          THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
          EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
          IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
          CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
          TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
          SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
        </P>
      </div>
      <EchoFooter />
    </div>
  );
}
