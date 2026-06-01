export declare const VERSION: string;

export declare class Button {
    constructor(client?: any);
    [key: string]: any;
}

export declare class ButtonV2 {
    constructor(client?: any);
    [key: string]: any;
}

export declare class Carousel {
    constructor(client?: any);
    [key: string]: any;
}

export declare class AIRich {
    constructor(client?: any);
    setTitle(title: string): this;
    setSubtitle(subtitle: string): this;
    setBody(body: string): this;
    setFooter(footer: string): this;
    setContextInfo(obj: Record<string, any>): this;
    addPayload(obj: Record<string, any>): this;
    addSubmessage(submessage: Record<string, any> | Record<string, any>[]): this;
    addSection(section: Record<string, any> | Record<string, any>[]): this;
    addText(text: string, options?: { hyperlink?: boolean; citation?: boolean; latex?: boolean }): this;
    addCode(language: string, code: string): this;
    addTable(table: any[]): this;
    addSource(sources?: any[]): this;
    addReels(reelsItems?: any[]): this;
    addImage(imageUrl: string): this;
    addVideo(videoUrl: string): this;
    addProduct(data?: Record<string, any>): this;
    addPost(data?: Record<string, any>): this;
    addTip(text: string): this;
    addSuggest(suggestion: string | string[]): this;
    title(title: string): this;
    subtitle(subtitle: string): this;
    body(body: string): this;
    footer(footer: string): this;
    contextInfo(obj: Record<string, any>): this;
    payload(obj: Record<string, any>): this;
    text(text: string, options?: { hyperlink?: boolean; citation?: boolean; latex?: boolean }): this;
    code(language: string, code: string): this;
    table(table: any[]): this;
    source(sources?: any[]): this;
    reels(reelsItems?: any[]): this;
    image(imageUrl: string): this;
    video(videoUrl: string): this;
    product(data?: Record<string, any>): this;
    post(data?: Record<string, any>): this;
    tip(text: string): this;
    suggest(suggestion: string | string[]): this;
    build(options?: Record<string, any>): any;
    send(jid: string, options?: Record<string, any>): Promise<any>;
}

export declare function extractIE(text: string, options?: Record<string, any>): any;
export declare function installNixcode(sock: any): any;
export declare const installAIRich: typeof installNixcode;
