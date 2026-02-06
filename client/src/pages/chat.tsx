import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Bot, Sparkles, Loader2, Copy, Plus, Trash2, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { authFetch } from "@/lib/api";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type Conversation = {
  id: number;
  title: string;
  createdAt: string;
  messages?: Message[];
};

export default function Chat() {
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: activeConversation } = useQuery<Conversation>({
    queryKey: ["/api/conversations", activeConversationId],
    enabled: !!activeConversationId,
  });

  useEffect(() => {
    if (activeConversation?.messages) {
      setLocalMessages(activeConversation.messages);
    }
  }, [activeConversation]);

  const createConversationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/conversations", { title: "New Chat" });
      return res.json();
    },
    onSuccess: (data) => {
      setActiveConversationId(data.id);
      setLocalMessages([]);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/conversations/${id}`);
    },
    onSuccess: () => {
      if (activeConversationId) {
        setActiveConversationId(null);
        setLocalMessages([]);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [localMessages, isTyping, streamingContent]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    let conversationId = activeConversationId;
    
    if (!conversationId) {
      const res = await apiRequest("POST", "/api/conversations", { title: input.slice(0, 50) || "New Chat" });
      const newConversation = await res.json();
      conversationId = newConversation.id;
      setActiveConversationId(newConversation.id);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    }

    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      content: input,
      createdAt: new Date().toISOString(),
    };

    setLocalMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);
    setStreamingContent("");

    try {
      const response = await authFetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMessage.content }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                fullContent += data.content;
                setStreamingContent(fullContent);
              }
              if (data.done) {
                const assistantMessage: Message = {
                  id: Date.now() + 1,
                  role: "assistant",
                  content: fullContent,
                  createdAt: new Date().toISOString(),
                };
                setLocalMessages(prev => [...prev, assistantMessage]);
                setStreamingContent("");
              }
              if (data.error) {
                throw new Error(data.error);
              }
            } catch (e) {
              if (!(e instanceof SyntaxError)) throw e;
            }
          }
        }
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to send message",
      });
    } finally {
      setIsTyping(false);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      description: "Message copied to clipboard",
      duration: 2000,
    });
  };

  const startNewChat = () => {
    setActiveConversationId(null);
    setLocalMessages([]);
    setStreamingContent("");
  };

  return (
    <Layout>
      <div className="flex h-[calc(100vh-4rem)]">
        <div className="hidden md:flex flex-col w-64 border-r border-border/40 bg-muted/20">
          <div className="p-4">
            <Button 
              onClick={startNewChat} 
              className="w-full gap-2"
              variant="outline"
              data-testid="button-new-chat"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </Button>
          </div>
          
          <ScrollArea className="flex-1 px-2">
            <div className="space-y-1">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-muted transition-colors ${
                    activeConversationId === conv.id ? "bg-muted" : ""
                  }`}
                  onClick={() => setActiveConversationId(conv.id)}
                  data-testid={`conversation-item-${conv.id}`}
                >
                  <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate flex-1">{conv.title}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversationMutation.mutate(conv.id);
                    }}
                    data-testid={`button-delete-conversation-${conv.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="flex flex-col flex-1 max-w-4xl mx-auto p-4 md:p-6 w-full">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-border/40">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Bot className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-chat-title">
                  AI Assistant
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-mono uppercase tracking-wider">GPT-5.1</span>
                </h1>
                <p className="text-xs text-muted-foreground">Powered by Replit AI Integrations</p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="flex gap-2 text-muted-foreground" 
              onClick={startNewChat}
              data-testid="button-new-session"
            >
              <Sparkles className="w-4 h-4" />
              New Session
            </Button>
          </div>

          <ScrollArea className="flex-1 pr-4 -mr-4 mb-4">
            <div className="space-y-6 pb-4">
              {localMessages.length === 0 && !isTyping && (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <Bot className="w-12 h-12 text-muted-foreground mb-4" />
                  <h2 className="text-lg font-medium mb-2" data-testid="text-welcome">How can I help you today?</h2>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Ask me anything - I can help with questions, explain concepts, assist with writing, analyze information, and much more.
                  </p>
                </div>
              )}

              {localMessages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                  data-testid={`message-${msg.role}-${msg.id}`}
                >
                  <Avatar className={`w-8 h-8 md:w-10 md:h-10 border ${msg.role === "assistant" ? "bg-primary/10 border-primary/20" : "bg-muted border-border"}`}>
                    {msg.role === "assistant" ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <Bot className="w-5 h-5 text-primary" />
                      </div>
                    ) : (
                      <AvatarFallback>ME</AvatarFallback>
                    )}
                  </Avatar>

                  <div className={`flex flex-col max-w-[80%] md:max-w-[70%] space-y-2 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    <div 
                      className={`p-4 rounded-2xl shadow-sm text-sm md:text-base leading-relaxed whitespace-pre-wrap ${
                        msg.role === "user" 
                          ? "bg-primary text-primary-foreground rounded-tr-none" 
                          : "bg-card border border-border/50 rounded-tl-none"
                      }`}
                    >
                      {msg.content}
                    </div>
                    
                    {msg.role === "assistant" && (
                      <div className="flex items-center gap-2 px-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-muted-foreground hover:text-foreground" 
                          onClick={() => copyToClipboard(msg.content)}
                          data-testid={`button-copy-${msg.id}`}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}

              {isTyping && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-4"
                  data-testid="message-streaming"
                >
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <div className="bg-card border border-border/50 p-4 rounded-2xl rounded-tl-none max-w-[80%] md:max-w-[70%]">
                    {streamingContent ? (
                      <div className="text-sm md:text-base leading-relaxed whitespace-pre-wrap">
                        {streamingContent}
                        <span className="inline-block w-2 h-4 bg-primary/50 animate-pulse ml-1" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 min-w-[60px]">
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1] }} 
                          transition={{ repeat: Infinity, duration: 1, ease: "easeInOut", delay: 0 }}
                          className="w-2 h-2 rounded-full bg-primary/40" 
                        />
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1] }} 
                          transition={{ repeat: Infinity, duration: 1, ease: "easeInOut", delay: 0.2 }}
                          className="w-2 h-2 rounded-full bg-primary/40" 
                        />
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1] }} 
                          transition={{ repeat: Infinity, duration: 1, ease: "easeInOut", delay: 0.4 }}
                          className="w-2 h-2 rounded-full bg-primary/40" 
                        />
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          <div className="relative mt-auto pt-2">
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                className="w-full min-h-[60px] max-h-[180px] p-4 pr-12 bg-muted/50 border border-border/50 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all text-sm md:text-base scrollbar-hide"
                rows={1}
                disabled={isTyping}
                data-testid="input-message"
              />
              <div className="absolute right-2 bottom-2">
                <Button 
                  size="icon" 
                  className={`h-9 w-9 transition-all ${input.trim() ? "opacity-100" : "opacity-50"}`} 
                  disabled={!input.trim() || isTyping}
                  onClick={handleSend}
                  data-testid="button-send"
                >
                  {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <p className="text-center text-[10px] text-muted-foreground mt-2">
              AI can make mistakes. Verify important information.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
