import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType, ShadingType, VerticalAlign } from 'docx';

export interface QuotationData {
  customerName: string;
  shopName?: string;
  phoneNumber?: string;
  date: string;
  validUntil: string;
  softwareName: string;
  subscriptionDuration: string;
  priceAgreedText: string;
  deviceAccess: string;
  hardwareIncluded: string;
  features: string[];
  totalDescription: string;
  totalAmountText: string;
  renewalChargesText: string;
}

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 100, bottom: 100, left: 140, right: 140 };

function labelCell(text: string, width: number, opts: any = {}) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    margins: cellMargins,
    shading: opts.shade ? { fill: opts.shade, type: ShadingType.CLEAR } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      children: [new TextRun({ text, bold: !!opts.bold, color: opts.color })]
    })]
  });
}

export async function generateQuotationBuffer(data: QuotationData): Promise<Buffer> {
  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 32, bold: true, font: "Arial", color: "1F4E79" },
          paragraph: { spacing: { before: 0, after: 200 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 26, bold: true, font: "Arial", color: "1F4E79" },
          paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 } },
      ]
    },
    numbering: {
      config: [
        { reference: "bullets",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ]
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
        }
      },
      children: [
        // Header / Title
        new Paragraph({
          children: [new TextRun({ text: "KRAVY BILLING SOLUTIONS", bold: true, size: 36, color: "1F4E79" })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 }
        }),
        new Paragraph({
          children: [new TextRun({ text: "Smart Billing & Inventory Software", size: 20, color: "555555", italics: true })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 }
        }),
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1F4E79", space: 1 } },
          spacing: { after: 200 }
        }),

        new Paragraph({
          children: [new TextRun({ text: "QUOTATION", bold: true, size: 30 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 }
        }),

        // Date / Customer / Validity row
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [1872, 1872, 1872, 1872, 1872],
          rows: [
            new TableRow({ children: [
              labelCell("Customer", 1872, { bold: true, shade: "EAF1F8" }),
              labelCell("Shop Name", 1872, { bold: true, shade: "EAF1F8" }),
              labelCell("Phone", 1872, { bold: true, shade: "EAF1F8" }),
              labelCell("Date", 1872, { bold: true, shade: "EAF1F8" }),
              labelCell("Valid Until", 1872, { bold: true, shade: "EAF1F8" }),
            ]}),
            new TableRow({ children: [
              labelCell(data.customerName, 1872),
              labelCell(data.shopName || "", 1872),
              labelCell(data.phoneNumber || "", 1872),
              labelCell(data.date, 1872),
              labelCell(data.validUntil, 1872),
            ]}),
          ]
        }),

        new Paragraph({ text: "", spacing: { after: 200 } }),

        new Paragraph({ text: "Dear Customer,", spacing: { after: 120 } }),
        new Paragraph({
          children: [new TextRun("Thank you for your interest in Kravy Billing Software. As discussed, we are pleased to offer you the following package:")],
          spacing: { after: 200 }
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Package Details")] }),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [3360, 6000],
          rows: [
            new TableRow({ children: [
              labelCell("Software Name", 3360, { bold: true, shade: "F5F7FA" }),
              labelCell(data.softwareName, 6000),
            ]}),
            new TableRow({ children: [
              labelCell("Subscription Duration", 3360, { bold: true, shade: "F5F7FA" }),
              labelCell(data.subscriptionDuration, 6000),
            ]}),
            new TableRow({ children: [
              labelCell("Price Agreed", 3360, { bold: true, shade: "F5F7FA" }),
              labelCell(data.priceAgreedText, 6000),
            ]}),
            new TableRow({ children: [
              labelCell("Device Access", 3360, { bold: true, shade: "F5F7FA" }),
              labelCell(data.deviceAccess, 6000),
            ]}),
            new TableRow({ children: [
              labelCell("Hardware Included", 3360, { bold: true, shade: "F5F7FA" }),
              labelCell(data.hardwareIncluded, 6000),
            ]}),
          ]
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Included Features")] }),
        ...(data.features && data.features.length > 0 ? data.features : [
          "Fast Billing System",
          "Inventory Management",
          "Daily, Weekly & Monthly Sales Reports",
          "Customer & Order Management",
          "Professional Invoice/Bill Generation",
          "Cloud-based Data Access",
          "Real-time Business Monitoring",
        ]).map(t => new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun(t)]
        })),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Total Amount")] }),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [6360, 3000],
          rows: [
            new TableRow({ children: [
              labelCell("Description", 6360, { bold: true, shade: "1F4E79", color: "FFFFFF" }),
              labelCell("Amount", 3000, { bold: true, shade: "1F4E79", color: "FFFFFF" }),
            ]}),
            new TableRow({ children: [
              labelCell(data.totalDescription, 6360),
              labelCell(data.totalAmountText, 3000),
            ]}),
            new TableRow({ children: [
              labelCell("Total Payable", 6360, { bold: true, shade: "EAF1F8" }),
              labelCell(data.totalAmountText, 3000, { bold: true, shade: "EAF1F8" }),
            ]}),
          ]
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Renewal Charges")] }),
        new Paragraph({
          children: [new TextRun(data.renewalChargesText)],
          spacing: { after: 200 }
        }),

        new Paragraph({ text: "", spacing: { after: 200 } }),
        new Paragraph({
          children: [new TextRun({ text: `This quotation is valid until ${data.validUntil}, as discussed with the customer.`, italics: true })],
          spacing: { after: 240 }
        }),

        new Paragraph({ children: [new TextRun("We look forward to serving your business with a smart and efficient billing solution.")], spacing: { after: 240 } }),

        new Paragraph({ children: [new TextRun("Regards,")], spacing: { after: 40 } }),
        new Paragraph({ children: [new TextRun({ text: "Vikas Kushwaha", bold: true })], spacing: { after: 0 } }),
        new Paragraph({ children: [new TextRun("Kravy Billing Solutions")] }),
      ]
    }]
  });

  return Packer.toBuffer(doc);
}
