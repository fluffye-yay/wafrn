import optionalAuthentication from '../utils/optionalAuthentication'
import checkIpBlocked from '../utils/checkIpBlocked'
import AuthorizedRequest from '../interfaces/authorizedRequest'
import { Application, Request, Response } from 'express'
import { Post, QuestionPoll, QuestionPollAnswer, QuestionPollQuestion, User, sequelize } from '../db'
import { Op, QueryTypes } from 'sequelize'
import {
  getEmojis,
  getLikes,
  getMedias,
  getMentionedUserIds,
  getQuotes,
  getTags,
  getUnjointedPosts
} from '../utils/baseQueryNew'
import getFollowedsIds from '../utils/cacheGetters/getFollowedsIds'
import { isDatabaseMysql } from '../utils/isDatabaseMysql'

export default function forumRoutes(app: Application) {
  app.get('/api/forum/:id', optionalAuthentication, async (req: AuthorizedRequest, res: Response) => {
    const userId = req.jwtData?.userId ? req.jwtData.userId : '00000000-0000-0000-0000-000000000000'
    const postId = req.params?.id as string
    const postsToGet = await Post.findOne({
      where: {
        id: postId
      },
      attributes: ['id', 'hierarchyLevel']
    })
    if (postsToGet) {
        let postIds = (
          await sequelize.query(
            isDatabaseMysql()
              ? `SELECT DISTINCT postsId FROM postsancestors where ancestorId = "${postsToGet.id}"`
              : `SELECT DISTINCT "postsId" FROM "postsancestors" where "ancestorId" = '${postsToGet.id}'`,
            {
              type: QueryTypes.SELECT
            }
          )
        ).map((elem: any) => elem.postsId)
        const fullPostsToGet = await Post.findAll({
          where: {
            id: {
              [Op.in]: postIds.concat([postId])
            },
            privacy: {
              [Op.ne]: 10
            },
            [Op.or]: [
              {
                userId: userId
              },
              {
                privacy: 1,
                userId: {
                  [Op.in]: await getFollowedsIds(userId, false)
                }
              },
              {
                privacy: {
                  [Op.in]: [0, 2, 3]
                }
              }
            ]
          }
        })
        const quotes = await getQuotes(postIds)
        const quotedPostsIds = quotes.map((quote) => quote.quotedPostId)
        postIds = postIds.concat(quotedPostsIds)
        const quotedPosts = await Post.findAll({
          where: {
            id: {
              [Op.in]: quotedPostsIds
            }
          }
        })
        let userIds = fullPostsToGet.map((pst: any) => pst.userId)
        userIds = userIds.concat(quotedPosts.map((q: any) => q.userId))
        const emojis = getEmojis({
          userIds,
          postIds
        })
        const mentions = await getMentionedUserIds(postIds)
        userIds = userIds.concat(mentions.usersMentioned)
        userIds = userIds.concat((await emojis).postEmojiReactions.map((react: any) => react.userId))
        const polls = QuestionPoll.findAll({
          where: {
            postId: {
              [Op.in]: postIds
            }
          },
          include: [
            {
              model: QuestionPollQuestion,
              include: [
                {
                  model: QuestionPollAnswer,
                  required: false,
                  where: {
                    userId: userId
                  }
                }
              ]
            }
          ]
        })
        const medias = getMedias(postIds)
        const tags = getTags(postIds)
        const likes = await getLikes(postIds)
        userIds = userIds.concat(likes.map((like: any) => like.userId))
        const users = User.findAll({
          attributes: ['url', 'avatar', 'id', 'name', 'remoteId'],
          where: {
            id: {
              [Op.in]: userIds
            }
          }
        })
        await Promise.all([emojis, users, polls, medias, tags])

        res.send({
          posts: (await fullPostsToGet).filter((elem: any) => elem.id !== postId ),
          emojiRelations: await emojis,
          mentions: mentions.postMentionRelation,
          users: await users,
          polls: await polls,
          medias: await medias,
          tags: await tags,
          likes: likes,
          quotes: quotes,
          quotedPosts: await quotedPosts
        })
      
    } else {
      res.sendStatus(404)
    }
  })
}
