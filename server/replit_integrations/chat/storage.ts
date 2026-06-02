import { db } from "../../db";
import { sql } from "drizzle-orm";

export interface Conversation {
  id: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt: Date;
}

export interface IChatStorage {
  getConversation(id: number): Promise<Conversation | undefined>;
  getAllConversations(): Promise<Conversation[]>;
  createConversation(title: string): Promise<Conversation>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<Message[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<Message>;
}

export const chatStorage: IChatStorage = {
  async getConversation(id: number) {
    const rows = await db.execute(
      sql`SELECT id, title, created_at as "createdAt", updated_at as "updatedAt" FROM conversations WHERE id = ${id}`
    );
    return rows.rows[0] as unknown as Conversation | undefined;
  },

  async getAllConversations() {
    const rows = await db.execute(
      sql`SELECT id, title, created_at as "createdAt", updated_at as "updatedAt" FROM conversations ORDER BY created_at DESC`
    );
    return rows.rows as unknown as Conversation[];
  },

  async createConversation(title: string) {
    const rows = await db.execute(
      sql`INSERT INTO conversations (title) VALUES (${title}) RETURNING id, title, created_at as "createdAt", updated_at as "updatedAt"`
    );
    return rows.rows[0] as unknown as Conversation;
  },

  async deleteConversation(id: number) {
    await db.execute(sql`DELETE FROM messages WHERE conversation_id = ${id}`);
    await db.execute(sql`DELETE FROM conversations WHERE id = ${id}`);
  },

  async getMessagesByConversation(conversationId: number) {
    const rows = await db.execute(
      sql`SELECT id, conversation_id as "conversationId", role, content, created_at as "createdAt" FROM messages WHERE conversation_id = ${conversationId} ORDER BY created_at`
    );
    return rows.rows as unknown as Message[];
  },

  async createMessage(conversationId: number, role: string, content: string) {
    const rows = await db.execute(
      sql`INSERT INTO messages (conversation_id, role, content) VALUES (${conversationId}, ${role}, ${content}) RETURNING id, conversation_id as "conversationId", role, content, created_at as "createdAt"`
    );
    return rows.rows[0] as unknown as Message;
  },
};
