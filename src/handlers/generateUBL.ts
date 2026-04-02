import { APIGatewayProxyEvent } from "aws-lambda";
import { jsonResponse } from "./response";
import { getOrderByIdSupa, getUserByIdSupa } from "../dataStore";
import { getUserIdFromSession } from "../userHelper";
import { createOrderUBLXML } from "../generateUBL";


export const generateUBLHandler = async (
  event: APIGatewayProxyEvent
) => {
  try {
    const orderId = event.pathParameters!.orderId!;
    const order = await getOrderByIdSupa(orderId);
    const session = event.headers.session;
    const items = order?.order_lines
    
    const result = await createOrderUBLXML(order, session, items, )

  } catch (e: unknown) {
    return jsonResponse(500, { error: 'INTERNAL SERVER ERROR' });
  }
}