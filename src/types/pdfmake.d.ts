declare module "pdfmake/build/pdfmake" {
  const pdfMake: {
    vfs?: Record<string, string>;
    fonts?: Record<string, unknown>;
    createPdf: (definition: unknown) => {
      download: (filename?: string) => void;
      open: () => void;
      getBase64: (callback: (base64: string) => void) => void;
    };
  };
  export default pdfMake;
}

declare module "pdfmake/build/vfs_fonts" {
  const pdfFonts: { pdfMake?: { vfs?: Record<string, string> } };
  export default pdfFonts;
}

declare module "pdfmake/interfaces" {
  export type Content = unknown;
  export type TableCell = unknown;
  export interface StyleDictionary {
    [key: string]: unknown;
  }
  export interface TDocumentDefinitions {
    content?: Content;
    styles?: StyleDictionary;
    defaultStyle?: Record<string, unknown>;
    footer?:
      | Content
      | ((
          currentPage: number,
          pageCount: number,
        ) => Content);
  }
}
