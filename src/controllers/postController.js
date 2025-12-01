// src/api/controllers/postController.js
const Post = require('../models/PostModel');
const Comment = require('../models/CommentModel');
const User = require('../models/UserModel');

// --- YARDIMCI FONKSİYON ---
// Bir eylem olduğunda (like, comment vb.)
// gönderi sahibine ve tüm arkadaşlarına haber verir.
const broadcastPostUpdate = async (req, post, eventName, eventData) => {
    try {
        const io = req.app.get('io');
        if (!io) return;

        // 1. Gönderi sahibini ve arkadaşlarını bul
        // NOT: Post objesi zaten user ID'sini içerir
        const postAuthor = await User.findById(post.user);
        if (!postAuthor) return;

        // 2. Alıcı listesi: Yazar + Yazarın arkadaşları
        const recipients = [
            postAuthor._id.toString(), // Gönderi sahibi
            ...(postAuthor.friends?.map(id => id.toString()) || []) // Arkadaşları
        ];

        // 3. (Giriş yapan kullanıcı zaten bu listede değilse onu da ekle)
        const currentUserStr = req.user.id.toString();
        if (!recipients.includes(currentUserStr)) {
            recipients.push(currentUserStr);
        }

        // 4. Benzersiz alıcılara sinyali gönder
        const uniqueRecipients = [...new Set(recipients)];

        uniqueRecipients.forEach(userId => {
            // Herkesi kendi özel 'userId' odasından bilgilendir
            io.to(userId).emit(eventName, eventData);
        });

    } catch (error) {
        console.error("Socket yayını hatası:", error);
    }
};
// ----------------------------


// @desc    Yeni bir gönderi oluştur
// @route   POST /api/v1/posts
const createPost = async (req, res) => {
    try {
        const { content } = req.body;
        const userId = req.user.id;

        if (!content && !req.file) {
            return res.status(400).json({ success: false, message: 'İçerik veya medya zorunludur.' });
        }

        let postData = {
            user: userId,
            content: (req.body && req.body.content) ? req.body.content : '',
        };

        if (req.file && req.file.filename) {
            postData.mediaUrl = `/uploads/post_media/${req.file.filename}`;
            postData.mediaType = req.file.mediaType;
        }

        const newPost = await Post.create(postData);

        // 💡 DÜZELTME: User'ı ve Yorumları popüle ederken avatarUrl ekle
        const populatedPost = await Post.findById(newPost._id)
                                    .populate('user', 'username avatarUrl') // 💡 avatarUrl EKLENDİ
                                    .populate({
                                        path: 'comments',
                                        populate: {
                                            path: 'user',
                                            select: 'username avatarUrl' // 💡 avatarUrl EKLENDİ
                                        }
                                    });

        await broadcastPostUpdate(req, populatedPost, 'newFeedPost', populatedPost);

        res.status(201).json({ success: true, data: populatedPost });
    } catch (error) {
        console.error("Gönderi oluşturma hatası:", error);
        res.status(500).json({ success: false, message: 'Gönderi oluşturulamadı', error: error.message });
    }
};

// @desc    Kullanıcının arkadaşlarının gönderilerini (Feed) getir
// @route   GET /api/v1/posts/feed
const getFeed = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const friendsList = user.friends;
        friendsList.push(req.user.id);

        const posts = await Post.find({ user: { $in: friendsList } })
            .sort({ createdAt: -1 })
            .limit(20)
            .populate('user', 'username avatarUrl') // 💡 avatarUrl EKLENDİ
            .populate({
                path: 'comments',
                populate: {
                    path: 'user',
                    select: 'username avatarUrl' // 💡 avatarUrl EKLENDİ
                }
            });

        res.status(200).json({ success: true, count: posts.length, data: posts });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Akış yüklenemedi', error: error.message });
    }
};

// @desc    Bir gönderiyi beğen/beğenmekten vazgeç
// @route   POST /api/v1/posts/:postId/like
const likePost = async (req, res) => {
    try {
        const postId = req.params.postId;
        const userId = req.user.id;

        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Gönderi bulunamadı' });
        }

        post.dislikes.pull(userId);

        const isLiked = post.likes.includes(userId);
        if (isLiked) {
            post.likes.pull(userId);
        } else {
            post.likes.push(userId);
        }

        await post.save();

        // Gönderinin son halini (like/dislike sayılarıyla) yayınla
        const updatedPost = await Post.findById(postId)
            .populate('user', 'username avatarUrl') // 💡 avatarUrl EKLENDİ
            .populate({
                path: 'comments',
                populate: {
                    path: 'user',
                    select: 'username avatarUrl' // 💡 avatarUrl EKLENDİ
                }
            });

        await broadcastPostUpdate(req, updatedPost, 'postUpdated', updatedPost);

        res.status(200).json({ success: true, data: updatedPost });
    } catch (error) {
        res.status(500).json({ success: false, message: 'İşlem başarısız', error: error.message });
    }
};

// @desc    Bir gönderiyi beğenme/beğenmemekten vazgeç
// @route   POST /api/v1/posts/:postId/dislike
const dislikePost = async (req, res) => {
    try {
        const postId = req.params.postId;
        const userId = req.user.id;

        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Gönderi bulunamadı' });
        }

        post.likes.pull(userId);

        const isDisliked = post.dislikes.includes(userId);
        if (isDisliked) {
            post.dislikes.pull(userId);
        } else {
            post.dislikes.push(userId);
        }

        await post.save();

        const updatedPost = await Post.findById(postId)
            .populate('user', 'username avatarUrl') // 💡 avatarUrl EKLENDİ
            .populate({
                path: 'comments',
                populate: {
                    path: 'user',
                    select: 'username avatarUrl' // 💡 avatarUrl EKLENDİ
                }
            });

        await broadcastPostUpdate(req, updatedPost, 'postUpdated', updatedPost);

        res.status(200).json({ success: true, data: updatedPost });
    } catch (error) {
        res.status(500).json({ success: false, message: 'İşlem başarısız', error: error.message });
    }
};

// @desc    Bir gönderiye yorum yap
// @route   POST /api/v1/posts/:postId/comment
const addComment = async (req, res) => {
    try {
        const postId = req.params.postId;
        const userId = req.user.id;
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({ success: false, message: 'Yorum içeriği boş olamaz' });
        }

        // 1. Yorumu oluştur
        const newComment = await Comment.create({
            user: userId,
            post: postId,
            content: content
        });

        // 2. Yorumu gönderiye bağla
        const post = await Post.findByIdAndUpdate(postId, {
            $push: { comments: newComment._id }
        }, { new: true });

        // 3. Yorumu kullanıcı bilgisiyle doldur
        const populatedComment = await Comment.findById(newComment._id)
                                        .populate('user', 'username avatarUrl'); // 💡 avatarUrl EKLENDİ

        // Herkese sadece yeni yorumu gönder (tüm gönderiyi değil)
        await broadcastPostUpdate(req, post, 'newComment', {
            postId: postId,
            comment: populatedComment
        });

        res.status(201).json({ success: true, data: populatedComment });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Yorum eklenemedi', error: error.message });
    }
};

const deletePost = async (req, res) => {
    try {
        const postId = req.params.postId;
        const userId = req.user.id;

        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Gönderi bulunamadı' });
        }

        // Sadece gönderi sahibi silebilir
        if (post.user.toString() !== userId) {
            return res.status(403).json({ success: false, message: 'Bu gönderiyi silme yetkiniz yok' });
        }

        // Gönderiyi sil
        await Post.findByIdAndDelete(postId);

        // Gönderiye ait yorumları da temizle
        await Comment.deleteMany({ post: postId });

        // Socket ile herkese haber ver (Anlık silinsin)
        await broadcastPostUpdate(req, post, 'postDeleted', { postId });

        res.status(200).json({ success: true, message: 'Gönderi silindi' });

    } catch (error) {
        console.error("Silme hatası:", error);
        res.status(500).json({ success: false, message: 'İşlem başarısız', error: error.message });
    }
};

module.exports = {
    createPost,
    getFeed,
    likePost,
    dislikePost,
    addComment,
    deletePost
};