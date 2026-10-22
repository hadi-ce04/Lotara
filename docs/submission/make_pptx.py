"""Builds docs/submission/lotara-pitch.pptx (16:9) from slide.png, with speaker notes.
Usage: python -I docs/submission/make_pptx.py"""
from pathlib import Path
from pptx import Presentation
from pptx.util import Emu

here = Path(__file__).resolve().parent
prs = Presentation()
prs.slide_width, prs.slide_height = Emu(12192000), Emu(6858000)  # 13.333 x 7.5 in, 16:9
slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank
slide.shapes.add_picture(str(here / "slide.png"), 0, 0, width=prs.slide_width, height=prs.slide_height)
slide.notes_slide.notes_text_frame.text = (
    "Lotara: which of our nursery kitchens received the recalled batch, and has someone acted? "
    "Real RappelConso notice, exact barcode + lot rules on Aiven PostgreSQL, AI investigator collects the "
    "missing label evidence, person confirms, kitchen reports, manager closes. On 28 labelled cases: "
    "11/11 correct matches and 1/12 false alarms vs 16/27 and 11/12 for name-only matching. "
    "Live demo: https://01a16320-7504-70fc-b08b-06bc2a4c1c84-8080.eur-1.aiven.app/welcome"
)
out = here / "lotara-pitch.pptx"
prs.save(out)
print("wrote", out)
