import { Conversations, Messages, Customers } from './connectors';
import { pubsub } from './subscription-manager';
import {
  getIntegration,
  getCustomer,
  getOrCreateConversation,
  createMessage,
  createCustomer,
  EngageVisitorMessage,
  CONVERSATION_STATUSES,
} from './utils';

export default {
  simulateInsertMessage(root, args) {
    return Messages.findOne({ _id: args.messageId }).then(message => {
      pubsub.publish('newMessagesChannel', message);
      pubsub.publish('notification');
    });
  },

  notify() {
    pubsub.publish('notification');
  },

  /*
   * create or update customer info, when connection establish
   */
  messengerConnect(root, args, { remoteAddress }) {
    let integration;
    let uiOptions;
    let messengerData;

    const { brandCode, email, isUser, name, data, browserInfo, cachedCustomerId } = args;

    // find integration
    return (
      getIntegration(brandCode, 'messenger')
        // find customer
        .then(integ => {
          integration = integ;
          uiOptions = integ.uiOptions;
          messengerData = integ.messengerData;

          return getCustomer({ cachedCustomerId, integrationId: integ._id, email });
        })

        .then(customer => {
          const now = new Date();

          // update customer
          if (customer) {
            // update messengerData
            Customers.update(
              { _id: customer._id },
              {
                $set: {
                  'messengerData.lastSeenAt': now,
                  'messengerData.isActive': true,
                  name,
                  isUser,
                },
              },
              () => {},
            );

            if (now - customer.messengerData.lastSeenAt > 30 * 60 * 1000) {
              // update session count
              Customers.update(
                { _id: customer._id },
                { $inc: { 'messengerData.sessionCount': 1 } },
                () => {},
              );
            }

            return Customers.findOne({ _id: customer._id });
          }

          // create new customer
          return createCustomer(
            { integrationId: integration._id, email, isUser, name },
            data
          );
        })

        // return integrationId, customerId
        .then(customer => {
          // if visitor then check for engage auto messages
          if (!email) {
            const engageHelper = new EngageVisitorMessage({
              brandCode,
              customer,
              integration,
              remoteAddress,
              browserInfo,
            });

            engageHelper.run();
          }

          return {
            integrationId: integration._id,
            uiOptions,
            messengerData,
            customerId: customer._id,
          }
        })

        // catch exception
        .catch(error => {
          console.log(error); // eslint-disable-line no-console
        })
    );
  },

  /*
   * create new message
   */
  insertMessage(root, args) {
    const { integrationId, customerId, conversationId, message, attachments } = args;

    // get or create conversation
    return (
      getOrCreateConversation({
        conversationId,
        integrationId,
        customerId,
        message,
      })

      // create message
      .then(id =>
        createMessage({
          conversationId: id,
          customerId,
          content: message,
          attachments,
        }),
      )

      .then(msg => {
        Conversations.update(
          { _id: msg.conversationId },
          {
            $set: {
              // if conversation is closed then reopen it.
              status: CONVERSATION_STATUSES.OPEN,

              // empty read users list then it will be shown as unread again
              readUserIds: [],
            },
          },
          () => {},
        );

        // publish change
        pubsub.publish('newMessagesChannel', msg);
        pubsub.publish('notification');

        return msg;
      })

      // catch exception
      .catch(error => {
        console.log(error); // eslint-disable-line no-console
      })
    );
  },

  /*
   * mark given conversation's messages as read
   */
  readConversationMessages(root, args) {
    return (
      Messages.update(
        {
          conversationId: args.conversationId,
          userId: { $exists: true },
          isCustomerRead: { $exists: false },
        },
        { isCustomerRead: true },
        { multi: true },
      )
        // notify all notification subscribers that message's read
        // state changed
        .then(() => {
          pubsub.publish('notification');
        })
    );
  },

  /*
   * save customer's email
   */
  saveCustomerEmail(root, args) {
    return Customers.update({ _id: args.customerId }, { email: args.email })
  },
};
