import { createFileRoute } from "@tanstack/react-router";
import EchoFooter from "@/components/landing/footer";
import { H1, H2, P } from "@/components/ui/typography";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms of Service — Echo Speech-to-Text" },
      {
        content:
          "Terms of service for Echo, the free open-source offline speech-to-text application.",
        name: "description",
      },
      { content: "noindex, follow", name: "robots" },
    ],
  }),
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background pt-24 font-sans text-foreground">
      <div className="container mx-auto max-w-3xl px-4 pb-20">
        <H1>Terms of Service</H1>
        <P className="text-muted-foreground">Last updated: November 20, 2025</P>

        <H2 className="mt-10">1. Acceptance of Terms</H2>
        <P>
          By downloading, installing, or using Echo, you agree to be bound by
          these Terms of Service. If you do not agree to these terms, please do
          not use the application.
        </P>

        <H2 className="mt-10">2. License</H2>
        <P>
          Echo is open-source software licensed under the MIT License. You are
          free to use, modify, and distribute the software in accordance with
          the terms of the license.
        </P>

        <H2 className="mt-10">3. Disclaimer of Warranty</H2>
        <P className="text-sm uppercase">
          THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
          EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
          IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
          CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
          TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
          SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
        </P>

        <H2 className="mt-10">4. Limitation of Liability</H2>
        <P>
          In no event shall Echo or its contributors be liable for any direct,
          indirect, incidental, special, exemplary, or consequential damages
          (including, but not limited to, procurement of substitute goods or
          services; loss of use, data, or profits; or business interruption)
          however caused and on any theory of liability, whether in contract,
          strict liability, or tort (including negligence or otherwise) arising
          in any way out of the use of this software, even if advised of the
          possibility of such damage.
        </P>
      </div>
      <EchoFooter />
    </div>
  );
}
